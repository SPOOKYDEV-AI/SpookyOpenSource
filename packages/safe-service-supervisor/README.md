# @spookyopensource/safe-service-supervisor

Small production-oriented building blocks for supervising long-running child processes without pretending that “process exists” means “service is ready”.

## What it solves

- stale PID/state files after a crash
- a previous process generation being mistaken for the new one
- restart loops that keep hammering a broken dependency
- processes being restarted before the old ones fully drain
- liveness being confused with readiness
- safe restart returning success before the replacement stack is actually usable
- multiple recovery paths racing each other

## Core ideas

### Generation-aware boot

Every supervisor instance receives a random boot ID. Child processes inherit it through `SERVICE_SUPERVISOR_BOOT_ID`. Readiness checks may report both boot ID and PID; stale processes are rejected.

### Canonical readiness

`evaluateServiceReadiness()` combines process state, generation identity and application-specific probes into one verdict. A service is not ready merely because its PID exists.

### Restart budget

`RestartBudget` limits restart attempts in a rolling window and opens a circuit for a cooldown period when the budget is exhausted.

### Process drain

`drainProcess()` requests graceful shutdown first, waits, then escalates only if needed. `drainServices()` drains in reverse order and verifies that every child is actually gone.

### Verified safe restart

`safeRestart()` captures the previous generation, drains it completely, starts the replacement, then waits for the new generation to pass canonical readiness before reporting success.

### Single recovery lane

`ServiceSupervisor.recover()` deduplicates concurrent recovery calls so watchdogs do not race each other.

## Quick start

```js
import { ServiceSupervisor } from "@spookyopensource/safe-service-supervisor";

const supervisor = new ServiceSupervisor({
  stateFile: ".runtime/service-state.json",
  services: [
    {
      name: "api",
      command: process.execPath,
      args: ["src/api.js"],
      readiness: async ({ child, bootId }) => {
        const response = await fetch("http://127.0.0.1:8080/ready");
        const body = await response.json();

        return {
          ready: response.ok && body.ready === true,
          pid: body.pid,
          bootId: body.bootId,
          reasons: body.reasons || [],
        };
      },
    },
  ],
});

await supervisor.start();

process.on("SIGTERM", async () => {
  await supervisor.stop();
  process.exit(0);
});
```

## Readiness contract

A readiness probe can return:

```js
{
  ready: true,
  pid: 1234,
  bootId: "...",
  reasons: []
}
```

`pid` and `bootId` are optional, but when present they are validated against the currently supervised process. This prevents stale health endpoints or old state files from validating a new deployment.

## Recovery strategy

Recommended order:

```text
probe fails
 -> bounded recovery lock
 -> check restart budget
 -> drain affected process
 -> wait until it is really gone
 -> backoff
 -> spawn replacement
 -> canonical readiness
 -> healthy

budget exhausted
 -> circuit open
 -> no restart storm
```

## Scope

This package does not know how your application authenticates, talks to databases, or exposes health endpoints. Applications provide readiness/recovery probes through callbacks.

## License

MIT.
