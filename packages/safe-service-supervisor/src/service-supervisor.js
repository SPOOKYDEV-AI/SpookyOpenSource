import { randomUUID } from "node:crypto";
import { AtomicJsonStateStore } from "./state-store.js";
import { RestartBudget } from "./restart-budget.js";
import {
  aggregateReadiness,
  evaluateServiceReadiness,
} from "./readiness.js";
import {
  drainProcess,
  drainServices,
  pidAlive,
  sleep,
  spawnManagedProcess,
} from "./process-utils.js";

function defaultBackoff(attempt) {
  return Math.min(
    30_000,
    1_000 * Math.max(
      1,
      2 ** Math.min(attempt, 5)
    )
  );
}

export class ServiceSupervisor {
  constructor({
    services = [],
    stateFile = ".runtime/service-supervisor.json",
    intervalMs = 10_000,
    readinessTimeoutMs = 60_000,
    readinessPollMs = 500,
    restart = {},
    backoff = defaultBackoff,
    spawnProcess = spawnManagedProcess,
    onState = null,
    onLog = null,
  } = {}) {
    if (!Array.isArray(services) || !services.length) {
      throw new Error("at least one service is required");
    }

    const names = services.map(service =>
      String(service?.name || "").trim()
    );

    if (
      names.some(name => !name) ||
      new Set(names).size !== names.length
    ) {
      throw new Error(
        "service names must be non-empty and unique"
      );
    }

    this.services = services.map(service => ({
      ...service,
      name: String(service.name).trim(),
    }));
    this.stateStore =
      stateFile instanceof AtomicJsonStateStore
        ? stateFile
        : new AtomicJsonStateStore({
            file: stateFile,
          });
    this.intervalMs = Math.max(
      1_000,
      Number(intervalMs) || 10_000
    );
    this.readinessTimeoutMs = Math.max(
      1_000,
      Number(readinessTimeoutMs) || 60_000
    );
    this.readinessPollMs = Math.max(
      50,
      Number(readinessPollMs) || 500
    );
    this.restartDefaults = {
      maxRestarts:
        restart.maxRestarts ?? 6,
      windowMs:
        restart.windowMs ?? 15 * 60_000,
      circuitOpenMs:
        restart.circuitOpenMs ?? 5 * 60_000,
    };
    this.backoff =
      typeof backoff === "function"
        ? backoff
        : defaultBackoff;
    this.spawnProcess = spawnProcess;
    this.onState =
      typeof onState === "function"
        ? onState
        : null;
    this.onLog =
      typeof onLog === "function"
        ? onLog
        : null;

    this.bootId = randomUUID();
    this.startedAt = new Date().toISOString();
    this.records = new Map();
    this.budgets = new Map();
    this.monitor = null;
    this.started = false;
    this.shuttingDown = false;
    this.status = "created";
    this.lastError = null;
    this.recoveryChain = Promise.resolve();
    this.recoveryByService = new Map();

    for (const service of this.services) {
      this.budgets.set(
        service.name,
        new RestartBudget({
          ...this.restartDefaults,
          ...(service.restart || {}),
        })
      );
    }

    this.writeState();
  }

  log(message, fields = {}) {
    if (this.onLog) {
      this.onLog({
        at: new Date().toISOString(),
        message: String(message),
        ...fields,
      });
    }
  }

  snapshot() {
    const services = {};

    for (const service of this.services) {
      const record = this.records.get(
        service.name
      );
      services[service.name] = {
        pid:
          record?.child?.exitCode === null
            ? record.child.pid
            : null,
        ready: Boolean(record?.ready),
        readiness:
          record?.readiness || null,
        startedAt:
          record?.startedAt || null,
        lastExit:
          record?.lastExit || null,
        restarts:
          record?.restarts || 0,
        budget:
          this.budgets.get(service.name)
            ?.snapshot() || null,
      };
    }

    return {
      supervisorPid: process.pid,
      bootId: this.bootId,
      startedAt: this.startedAt,
      status: this.status,
      shuttingDown: this.shuttingDown,
      lastError: this.lastError,
      services,
      updatedAt: new Date().toISOString(),
    };
  }

  writeState() {
    const state = this.snapshot();
    this.stateStore.write(state);

    if (this.onState) {
      try {
        this.onState(state);
      } catch {
        // Observability callbacks must not break supervision.
      }
    }
  }

  async start({ requireReady = true } = {}) {
    if (this.started) {
      return this.probeAll();
    }

    this.started = true;
    this.shuttingDown = false;
    this.status = "starting";
    this.lastError = null;
    this.writeState();

    try {
      for (const service of this.services) {
        await this.startService(service);
      }

      const readiness =
        await this.waitUntilReady({
          timeoutMs: this.readinessTimeoutMs,
        });

      if (!readiness.ready && requireReady) {
        const error = new Error(
          "service stack did not reach canonical readiness"
        );
        error.code = "STARTUP_NOT_READY";
        error.reasons = readiness.reasons;
        this.lastError = error.message;
        this.status = "not-ready";
        this.writeState();
        await this.stop();
        throw error;
      }

      this.status = readiness.ready
        ? "healthy"
        : "not-ready";
      this.writeState();
      this.startMonitor();
      return readiness;
    } catch (error) {
      this.lastError =
        error instanceof Error
          ? error.message
          : String(error);
      this.writeState();
      throw error;
    }
  }

  async startService(service) {
    const existing = this.records.get(
      service.name
    );

    if (
      existing?.child?.pid &&
      pidAlive(existing.child.pid)
    ) {
      return existing;
    }

    const env = {
      ...process.env,
      ...(service.env || {}),
      SERVICE_SUPERVISOR_BOOT_ID:
        this.bootId,
      SERVICE_SUPERVISOR_SERVICE_NAME:
        service.name,
    };

    const child = this.spawnProcess({
      command: service.command,
      args: service.args || [],
      cwd: service.cwd || process.cwd(),
      env,
      stdio:
        service.stdio ||
        ["ignore", "pipe", "pipe"],
      windowsHide:
        service.windowsHide !== false,
    });

    const previousRestarts =
      existing?.restarts || 0;
    const record = {
      name: service.name,
      service,
      child,
      ready: false,
      readiness: null,
      startedAt: new Date().toISOString(),
      lastExit: existing?.lastExit || null,
      restarts: previousRestarts,
    };

    this.records.set(service.name, record);
    this.attachChild(record);
    this.log("service started", {
      service: service.name,
      pid: child.pid,
      bootId: this.bootId,
    });
    this.writeState();
    return record;
  }

  attachChild(record) {
    const { child, name } = record;

    child.once("exit", (code, signal) => {
      record.ready = false;
      record.readiness = {
        ready: false,
        reasons: [{
          code: "PROCESS_EXITED",
          message:
            "Process exited code=" +
            String(code) +
            " signal=" +
            String(signal),
        }],
      };
      record.lastExit = {
        at: new Date().toISOString(),
        code,
        signal,
      };
      this.writeState();

      if (
        this.started &&
        !this.shuttingDown
      ) {
        void this.recover(
          name,
          "process-exit"
        );
      }
    });

    child.once("error", error => {
      this.log("service process error", {
        service: name,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      });
    });
  }

  async probeService(name) {
    const record = this.records.get(name);
    const service = this.services.find(
      item => item.name === name
    );

    if (!record || !service) {
      return {
        service: name,
        ready: false,
        reasons: [{
          code: "SERVICE_NOT_STARTED",
          message: "Service has no active record",
        }],
      };
    }

    const alive = pidAlive(record.child?.pid);
    let probe = {
      ready: alive,
      pid: record.child?.pid || null,
      bootId: this.bootId,
      reasons: alive
        ? []
        : [{
            code: "PROCESS_DOWN",
            message: "Managed process is not alive",
          }],
    };

    if (
      alive &&
      typeof service.readiness === "function"
    ) {
      try {
        probe = await service.readiness({
          child: record.child,
          bootId: this.bootId,
          service,
          supervisor: this,
        });
      } catch (error) {
        probe = {
          ready: false,
          pid: record.child?.pid || null,
          bootId: this.bootId,
          reasons: [{
            code: "READINESS_PROBE_ERROR",
            message:
              error instanceof Error
                ? error.message
                : String(error),
          }],
        };
      }
    }

    const result = evaluateServiceReadiness({
      processAlive: alive,
      expectedPid: record.child?.pid,
      expectedBootId: this.bootId,
      probe,
    });

    record.ready = result.ready;
    record.readiness = result;

    return {
      service: name,
      ...result,
    };
  }

  async probeAll() {
    const results = [];

    for (const service of this.services) {
      results.push(
        await this.probeService(service.name)
      );
    }

    const aggregate = aggregateReadiness(
      results
    );

    if (aggregate.ready) {
      this.status = "healthy";
      this.lastError = null;
    } else if (!this.shuttingDown) {
      this.status = "degraded";
    }

    this.writeState();
    return {
      ...aggregate,
      services: results,
    };
  }

  async waitUntilReady({
    timeoutMs = this.readinessTimeoutMs,
  } = {}) {
    const deadline = Date.now() + timeoutMs;
    let last = {
      ready: false,
      reasons: [{
        code: "READINESS_NOT_CHECKED",
        message: "Readiness has not been checked",
      }],
      services: [],
    };

    while (
      !this.shuttingDown &&
      Date.now() < deadline
    ) {
      last = await this.probeAll();
      if (last.ready) return last;
      await sleep(this.readinessPollMs);
    }

    return last;
  }

  startMonitor() {
    if (this.monitor) return;

    this.monitor = setInterval(
      () => void this.monitorTick(),
      this.intervalMs
    );
    this.monitor.unref?.();
  }

  async monitorTick() {
    if (this.shuttingDown) return;

    const readiness = await this.probeAll();
    if (readiness.ready) return;

    for (const result of readiness.services) {
      if (!result.ready) {
        void this.recover(
          result.service,
          "readiness-failed"
        );
      }
    }
  }

  recover(name, reason = "manual") {
    if (this.recoveryByService.has(name)) {
      return this.recoveryByService.get(name);
    }

    const task = this.recoveryChain
      .catch(() => {})
      .then(() =>
        this.recoverOne(name, reason)
      );

    this.recoveryChain = task.catch(() => {});
    this.recoveryByService.set(name, task);

    task.finally(() => {
      this.recoveryByService.delete(name);
    }).catch(() => {});

    return task;
  }

  async recoverOne(name, reason) {
    if (this.shuttingDown) {
      return {
        recovered: false,
        reason: "shutting-down",
      };
    }

    const service = this.services.find(
      item => item.name === name
    );
    const record = this.records.get(name);
    const budget = this.budgets.get(name);

    if (!service || !budget) {
      throw new Error(
        "unknown service: " + String(name)
      );
    }

    if (!budget.canRestart()) {
      this.status = "circuit-open";
      this.lastError =
        "restart circuit open for " + name;
      this.writeState();
      return {
        recovered: false,
        circuitOpen: true,
        budget: budget.snapshot(),
      };
    }

    budget.record();
    this.status = "recovering";
    this.log("service recovery started", {
      service: name,
      reason,
    });
    this.writeState();

    if (record?.child) {
      const drained = await drainProcess(
        record.child,
        {
          ...(service.drain || {}),
        }
      );

      if (!drained.drained) {
        this.status = "degraded";
        this.lastError =
          "failed to drain old process for " +
          name;
        this.writeState();
        return {
          recovered: false,
          drained: false,
          budget: budget.snapshot(),
        };
      }
    }

    const attempt =
      budget.snapshot().attemptsInWindow;
    const delay = Math.max(
      0,
      Number(
        this.backoff(attempt, {
          service: name,
          reason,
        })
      ) || 0
    );

    if (delay) await sleep(delay);

    const next = await this.startService({
      ...service,
    });
    next.restarts =
      (record?.restarts || 0) + 1;

    const readiness =
      await this.waitForServiceReady(
        name,
        service.readinessTimeoutMs ||
          this.readinessTimeoutMs
      );

    if (!readiness.ready) {
      this.status = "degraded";
      this.lastError =
        "replacement service did not become ready: " +
        name;
      this.writeState();
      return {
        recovered: false,
        readiness,
        budget: budget.snapshot(),
      };
    }

    this.status = "healthy";
    this.lastError = null;
    this.writeState();
    this.log("service recovery succeeded", {
      service: name,
      pid: next.child.pid,
    });

    return {
      recovered: true,
      readiness,
      budget: budget.snapshot(),
    };
  }

  async waitForServiceReady(
    name,
    timeoutMs = this.readinessTimeoutMs
  ) {
    const deadline = Date.now() + timeoutMs;
    let last = await this.probeService(name);

    while (
      !this.shuttingDown &&
      !last.ready &&
      Date.now() < deadline
    ) {
      await sleep(this.readinessPollMs);
      last = await this.probeService(name);
    }

    this.writeState();
    return last;
  }

  async stop() {
    if (this.shuttingDown) return;

    this.shuttingDown = true;
    this.status = "stopping";
    this.writeState();

    if (this.monitor) {
      clearInterval(this.monitor);
      this.monitor = null;
    }

    const records = this.services
      .map(service => {
        const record = this.records.get(
          service.name
        );
        return record
          ? {
              ...record,
              drainOptions:
                service.drain || {},
            }
          : null;
      })
      .filter(Boolean);

    const drained = await drainServices(records);

    this.status = drained.drained
      ? "stopped"
      : "drain-failed";
    this.lastError = drained.drained
      ? null
      : "one or more managed processes did not drain";
    this.started = false;
    this.writeState();

    if (drained.drained) {
      this.stateStore.clear();
    }

    return drained;
  }
}
