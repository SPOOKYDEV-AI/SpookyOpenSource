import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ServiceSupervisor,
  pidAlive,
} from "../src/index.js";

test("supervisor restarts a service and verifies replacement readiness", async () => {
  const dir = mkdtempSync(
    join(tmpdir(), "service-supervisor-")
  );
  const stateFile = join(dir, "state.json");

  const supervisor = new ServiceSupervisor({
    stateFile,
    intervalMs: 60_000,
    readinessTimeoutMs: 3000,
    readinessPollMs: 20,
    backoff: () => 0,
    restart: {
      maxRestarts: 4,
      windowMs: 60_000,
      circuitOpenMs: 1000,
    },
    services: [{
      name: "worker",
      command: process.execPath,
      args: [
        "-e",
        "setInterval(() => {}, 1000)",
      ],
      readiness: async ({ child, bootId }) => ({
        ready: pidAlive(child.pid),
        pid: child.pid,
        bootId,
      }),
      drain: {
        gracefulTimeoutMs: 1000,
        forceTimeoutMs: 1000,
      },
    }],
  });

  try {
    const started = await supervisor.start();
    assert.equal(started.ready, true);

    const firstPid =
      supervisor.snapshot().services.worker.pid;
    assert.equal(pidAlive(firstPid), true);

    const recovered = await supervisor.recover(
      "worker",
      "test"
    );

    assert.equal(recovered.recovered, true);
    const secondPid =
      supervisor.snapshot().services.worker.pid;
    assert.notEqual(secondPid, firstPid);
    assert.equal(pidAlive(secondPid), true);
    assert.equal(pidAlive(firstPid), false);
  } finally {
    await supervisor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("concurrent recovery calls for one service are deduplicated", async () => {
  const dir = mkdtempSync(
    join(tmpdir(), "service-supervisor-")
  );

  const supervisor = new ServiceSupervisor({
    stateFile: join(dir, "state.json"),
    intervalMs: 60_000,
    readinessTimeoutMs: 3000,
    readinessPollMs: 20,
    backoff: () => 0,
    services: [{
      name: "worker",
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      readiness: ({ child, bootId }) => ({
        ready: pidAlive(child.pid),
        pid: child.pid,
        bootId,
      }),
    }],
  });

  try {
    await supervisor.start();
    const before = supervisor.snapshot().services.worker.restarts;

    const [a, b, c] = await Promise.all([
      supervisor.recover("worker", "a"),
      supervisor.recover("worker", "b"),
      supervisor.recover("worker", "c"),
    ]);

    assert.equal(a.recovered, true);
    assert.equal(b.recovered, true);
    assert.equal(c.recovered, true);
    assert.equal(
      supervisor.snapshot().services.worker.restarts,
      before + 1
    );
  } finally {
    await supervisor.stop();
    rmSync(dir, { recursive: true, force: true });
  }
});
