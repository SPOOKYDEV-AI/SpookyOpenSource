# Changelog

All notable changes to public packages are documented here.

## safe-service-supervisor 0.1.0 - 2026-09-23

### Added

- generation-aware Boot IDs
- canonical readiness with PID/generation validation
- atomic supervisor state
- process drain and escalation
- verified safe restart
- serialized auto-recovery
- rolling restart budget and circuit breaker
- regression tests for stale generations and recovery deduplication

## jwt-resilience 0.1.0 - 2026-09-23

### Added

- provider-agnostic JWT token manager
- atomic file-backed token store
- proactive refresh before expiry
- concurrent refresh deduplication
- bounded 401/403 recovery
- explicit auth recovery controller
- readiness helpers
- auth watchdog with cooldown and circuit breaker
- Windows interactive scheduled-task refresher
- SID-based rejection of Windows service accounts
- TypeScript declarations
- Linux and Windows CI
- public-repository leakage guard
