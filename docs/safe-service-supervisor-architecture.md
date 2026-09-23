# Safe Service Supervisor Architecture

`safe-service-supervisor` separates process lifecycle, readiness and recovery so applications can choose their own health probes without reimplementing restart safety.

## Lifecycle

```text
supervisor starts
  -> create Boot ID
  -> spawn managed services
  -> child inherits Boot ID
  -> canonical readiness
  -> healthy

readiness fails
  -> serialized recovery lane
  -> restart budget check
  -> drain old process
  -> verify old PID is gone
  -> backoff
  -> spawn replacement
  -> verify PID + Boot ID + app probe
  -> healthy

restart budget exhausted
  -> circuit open
  -> stop restart storm
```

## Boot generations

Every `ServiceSupervisor` instance creates one UUID Boot ID. Children inherit it through the `SERVICE_SUPERVISOR_BOOT_ID` environment variable.

Applications may expose that Boot ID through their readiness endpoint. If a stale process or stale endpoint reports another generation, `evaluateServiceReadiness()` rejects it.

## Canonical readiness

Readiness can validate four independent facts:

- the managed process is alive
- the application probe reports ready
- an optional reported PID matches the supervised PID
- an optional reported Boot ID matches the supervisor generation

That is deliberately stricter than a liveness endpoint.

## Recovery lane

`recover(serviceName)` is deduplicated per service and serialized globally. Two independent watchdogs may request recovery at the same time, but only one process replacement occurs at once.

## Restart budget

`RestartBudget` tracks restart attempts in a rolling time window. Once the configured budget is consumed, the circuit opens for a cooldown period. This prevents a broken dependency from causing an endless process-spawn loop.

## Drain

`drainProcess()` requests graceful termination first. It waits for the PID to disappear, then escalates only when necessary. A replacement is never considered safe while the previous PID is still alive.

For platforms that need special process-tree termination, callers may provide a custom `terminate()` callback.

## External safe restart

`safeRestart()` is designed for wrappers or service managers that restart an entire supervisor generation:

```text
read old state
 -> capture old Boot ID
 -> stop/drain old generation
 -> start replacement
 -> require a different Boot ID
 -> require fresh start timestamp
 -> require canonical ready
 -> success
```

It refuses to report success when the old generation did not drain or the replacement never became ready.

## State

`AtomicJsonStateStore` writes runtime state through temporary-file replacement. The state is intended for observability and restart coordination, not as a durable database.

## Application-owned responsibilities

The consuming application still owns:

- its HTTP/database/provider health probes
- graceful shutdown hooks
- platform-specific process-tree termination when needed
- alerting/metrics transport
- any authentication or business logic

The supervisor package intentionally contains none of those provider-specific concerns.
