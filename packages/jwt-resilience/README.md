# @spookyopensource/jwt-resilience

Provider-agnostic JWT reliability primitives extracted from a long-running production bot and cleaned up for public reuse.

## What it solves

Long-running services often fail in the same boring ways:

- the JWT expires while the process is still healthy
- several requests notice expiry at the same time and stampede the refresh endpoint
- a `401` or `403` triggers infinite refresh/retry loops
- a restart is used where a hot auth refresh would have been enough
- readiness reports healthy while auth is already unusable
- Windows browser automation accidentally runs as LocalSystem and cannot access a desktop session

This package addresses those failure modes without depending on a specific API provider.

## Core behavior

### Atomic token cache

`FileTokenStore` writes through a temporary file and rename, with restrictive file permissions where supported.

### Refresh before expiry

`JwtTokenManager` treats a token as expiring before its actual `exp` time. Concurrent callers share one in-flight refresh promise.

### Bounded 401/403 recovery

`ResilientAuthClient` performs at most:

1. normal request
2. one forced auth refresh
3. one replay

Then it stops. A persistent `403` is surfaced instead of creating a refresh storm.

### Proactive watchdog

`AuthSupervisor` periodically checks auth health and refreshes before the dangerous expiry window. It includes cooldown and circuit-breaker protection.

### Readiness

`evaluateAuthReadiness()` makes auth validity an explicit part of service readiness instead of equating “HTTP process is alive” with “service can actually authenticate”.

### Windows interactive refresh worker

The optional PowerShell helper registers a refresh worker in the real interactive desktop user session and rejects LocalSystem / LocalService / NetworkService by SID, so it works independently of Windows display language.

## Quick start

```js
import {
  AuthSupervisor,
  FileTokenStore,
  JwtTokenManager,
  ResilientAuthClient,
} from "@spookyopensource/jwt-resilience";

const store = new FileTokenStore({
  file: ".runtime/auth.json",
});

const manager = new JwtTokenManager({
  store,
  refresh: async () => {
    // Call your own refresh/session flow here.
    // Return either a token string or { token, expiresAt, source }.
    return refreshMyProvider();
  },
  skewMs: 15 * 60_000,
});

const client = new ResilientAuthClient({
  tokenManager: manager,
});

const supervisor = new AuthSupervisor({
  tokenManager: manager,
  refreshBeforeMs: 20 * 60_000,
});

supervisor.start();

const response = await client.request(
  "https://api.example.com/data"
);
```

## 403 policy

`403` is deliberately **not** treated as identical to `401`.

- `401`: cached credential can be invalidated before refresh.
- `403`: token is preserved, one forced refresh is attempted, then one replay. If the replay is still `403`, the denial is surfaced.

This avoids turning a real permission failure into an infinite auth loop.

## Windows interactive worker

See [`windows/Register-InteractiveRefreshWorker.ps1`](windows/Register-InteractiveRefreshWorker.ps1) and [`src/windows-task-refresh.js`](src/windows-task-refresh.js).

The worker script itself is application-specific: it should refresh your session/token and write the result to the same token store used by `JwtTokenManager`.

### Worker state contract

`createWindowsTaskRefresher()` watches a small JSON state file written by your worker:

```json
{
  "status": "success",
  "startedAt": "2026-09-23T10:00:00.000Z",
  "finishedAt": "2026-09-23T10:00:03.000Z",
  "code": null,
  "error": null
}
```

Supported terminal states are `success`, `failed`, and `human-required`. On success, the refresher calls your `readToken()` callback to load the token that the worker persisted.

Example wiring:

```js
import {
  FileTokenStore,
  JwtTokenManager,
  createWindowsTaskRefresher,
} from "@spookyopensource/jwt-resilience";

const store = new FileTokenStore({
  file: ".runtime/auth.json",
});

const refresh = createWindowsTaskRefresher({
  taskName: "MyJwtRefreshWorker",
  stateFile: ".runtime/auth-worker.json",
  readToken: () => store.load(),
});

const manager = new JwtTokenManager({
  store,
  refresh,
});
```

## Scope

This package contains generic resilience logic only. It intentionally does **not** include private provider endpoints, cookies, production credentials, or browser profiles.

## License

MIT.
