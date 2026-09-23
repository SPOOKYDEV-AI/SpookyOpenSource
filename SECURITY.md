# Security

## Do not commit authentication material

Keep all of the following out of Git:

- JWTs and refresh tokens
- session cookies
- browser profiles
- worker state containing credentials
- private API endpoints or account identifiers

The example runtime paths are ignored by the repository `.gitignore`.

## 401 vs 403

This project intentionally treats `401` and `403` differently:

- `401` normally means the presented credential is invalid and may be invalidated before refresh.
- `403` can mean either stale auth **or a legitimate authorization denial**. The toolkit performs at most one forced refresh + one replay and does not loop.

Applications should still enforce their own authorization rules after authentication succeeds.

## Windows workers

Interactive browser refresh workers must run in a real desktop user session. Never register browser automation under LocalSystem, LocalService, or NetworkService. The included PowerShell helper rejects those accounts by SID.

## Reporting

Please open a GitHub issue for non-sensitive reliability/security problems. For a vulnerability that would expose credentials, avoid posting secrets or reproduction tokens publicly.
