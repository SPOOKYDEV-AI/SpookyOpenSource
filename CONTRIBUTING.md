# Contributing

Thanks for helping improve SpookyOpenSource.

## Principles

1. Keep reusable packages provider-agnostic.
2. Never commit production credentials, cookies, browser profiles, account IDs, private endpoints, machine names, or local paths.
3. Prefer bounded recovery over infinite retry loops.
4. Keep liveness, authentication health, and readiness as separate concepts.
5. Add regression tests for every reliability bug.
6. Windows browser workers must run in a real interactive user session, never a service account.

## Development

Requirements:

- Node.js 20+
- PowerShell only if changing Windows worker scripts

Run:

```bash
npm install --ignore-scripts
npm run validate
```

`npm run validate` checks syntax, tests, public-repository safety, and the publishable package contents.

## Pull requests

Keep changes focused and explain:

- the failure mode being addressed
- the recovery semantics
- retry/cooldown limits
- any new public API
- tests added

Do not add provider-specific authentication flows to `jwt-resilience`. Put provider behavior in the consuming application or in a separate adapter package.
