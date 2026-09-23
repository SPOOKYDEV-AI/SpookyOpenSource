# JWT Resilience Architecture

The package separates authentication reliability into small components so applications can replace only the provider-specific part.

## Data flow

```text
application request
      |
      v
ResilientAuthClient
      |
      v
JwtTokenManager ------> FileTokenStore
      |                      ^
      | refresh              | persisted token
      v                      |
provider adapter / optional worker
```

`AuthSupervisor` runs beside the request path and refreshes proactively. `AuthRecoveryController` is the explicit recovery orchestration path when an application wants a direct-refresh -> fallback-worker -> verification sequence.

## Responsibilities

### `JwtTokenManager`

- owns the current token state
- decides whether the token is too close to expiry
- deduplicates concurrent refresh calls
- adopts a token returned by another recovery mechanism
- reloads a token written by an external worker

### `FileTokenStore`

- persists only the token metadata supplied by the application
- uses temp-file replacement to avoid partially written JSON
- is not a credential vault; filesystem permissions remain the application's responsibility

### `ResilientAuthClient`

- adds the authorization header
- handles only configured auth statuses
- performs at most one forced refresh and one replay
- treats 403 more carefully than 401

### `AuthSupervisor`

- watches expiry independently of user traffic
- refreshes before expiry
- deduplicates recovery
- applies cooldown and circuit-breaker limits

### `AuthRecoveryController`

- tries direct refresh first
- optionally invokes a fallback recovery mechanism
- accepts a token returned directly or reloads one persisted externally
- optionally runs an application-provided readiness verification
- exposes `healthy`, `degraded`, and `auth-required` outcomes

### Windows worker

The provided PowerShell helper creates a Scheduled Task in the real interactive desktop session. It identifies LocalSystem, LocalService, and NetworkService by SID rather than localized account names.

The package deliberately does not implement browser automation itself. The consuming application owns its authorized refresh flow.

## Recovery contract

Recommended sequence:

```text
token still healthy
  -> use immediately

token near expiry
  -> proactive direct refresh

401 / recoverable 403
  -> forced refresh
  -> replay once

direct refresh unavailable
  -> optional fallback worker
  -> adopt/reload new token
  -> verify readiness

persistent denial
  -> stop retrying
  -> degraded or auth-required
```

## What this package intentionally does not do

- bypass authentication requirements
- discover private provider endpoints
- store browser profiles
- ship service-specific cookies
- infer whether a persistent 403 should be authorized
- restart an entire application when hot auth recovery is enough
