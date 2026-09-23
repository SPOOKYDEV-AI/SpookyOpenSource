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
