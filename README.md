# SpookyOpenSource

Reusable production-grade building blocks extracted from real systems and cleaned up for public use.

## Packages

### `jwt-resilience`

A provider-agnostic JWT reliability toolkit for long-running Node.js services:

- atomic JWT cache on disk
- proactive refresh before expiry
- concurrent refresh deduplication
- bounded `401/403 -> refresh -> retry once`
- 403-safe behavior (does not blindly destroy a valid token)
- recovery metrics
- auth health state machine
- restart-storm/circuit-breaker protection
- readiness helpers
- optional Windows interactive refresh worker support
- service-account detection by SID, independent of Windows language

See [`packages/jwt-resilience`](packages/jwt-resilience).

### `safe-service-supervisor`

A generation-aware process supervisor for long-running services:

- unique Boot ID per supervisor generation
- canonical readiness instead of PID-only health
- PID/Boot ID stale-process rejection
- graceful process drain with escalation
- verified safe restart
- serialized recovery lane
- exponential backoff
- rolling restart budget + circuit breaker
- atomic runtime state

See [`packages/safe-service-supervisor`](packages/safe-service-supervisor).

Architecture: [safe-service-supervisor](docs/safe-service-supervisor-architecture.md).

### `async-work-control`

Dependency-free async workload controls for Node.js services:

- FIFO serialization per logical key
- unrelated keys remain concurrent
- bounded global concurrency
- abortable waiters
- sliding-window request limiting
- retry-delay introspection
- queue/gate observability
- failure-safe cleanup so rejected tasks do not poison future work

See [`packages/async-work-control`](packages/async-work-control).

Useful references:

- [Architecture](docs/jwt-resilience-architecture.md)
- [Integration checklist](docs/integration-checklist.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Security

This repository intentionally contains **no production tokens, cookies, private endpoints, browser profiles, account IDs, or provider-specific credentials**.

Never commit runtime auth stores or browser profiles. See [SECURITY.md](SECURITY.md).

## License

MIT.
