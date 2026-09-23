# Integration Checklist

Use this checklist when adding `jwt-resilience` to a long-running service.

## 1. Define the provider adapter

Implement one authorized refresh function that returns:

```js
{
  token: "...",
  expiresAt: 0, // optional epoch milliseconds
  source: "refresh"
}
```

Keep provider endpoints, cookies, browser automation, and account-specific logic outside the package.

## 2. Persist the token

Use `FileTokenStore` for simple local services or implement the `TokenStore` interface for another storage backend.

Protect the runtime directory with appropriate operating-system permissions. The file store is a reliability primitive, not a secret vault.

## 3. Refresh before expiry

Choose a safety window that is comfortably larger than normal network or worker recovery time. Do not wait until the final seconds of token lifetime.

## 4. Deduplicate recovery

Use one shared `JwtTokenManager` per auth identity. Do not create a new token manager for every request.

## 5. Bound 401/403 replay

Use `ResilientAuthClient` or implement equivalent semantics:

```text
request
 -> auth failure
 -> one forced refresh
 -> one replay
 -> stop
```

Never retry a persistent authorization denial forever.

## 6. Add a proactive supervisor

Start `AuthSupervisor` independently of user traffic so an idle service still renews auth before the next request arrives.

## 7. Add an explicit recovery path

`AuthRecoveryController` is useful when direct refresh can fail and a second mechanism exists, such as a user-session worker.

Verify auth after the fallback completes; do not treat “worker process exited successfully” as proof that the service can authenticate.

## 8. Make auth part of readiness

A live HTTP process is not necessarily ready. Readiness should fail when the service cannot authenticate to a required upstream.

## 9. Keep hot auth recovery separate from process restart

Prefer adopting/reloading a fresh token in the running service. Restart the application only when the process itself is unhealthy.

## 10. Windows interactive workers

If browser/session refresh requires a desktop, register the worker under the real interactive user. Reject service accounts by SID, not localized account names.

## 11. Observe recovery

Expose at least:

- current auth validity and expiry
- last refresh time
- recovery attempts / successes / failures
- last recovery error/code
- circuit-breaker state

## 12. Test failure modes

Add tests for:

- concurrent refresh callers
- token close to expiry
- direct refresh failure
- fallback worker success
- persistent 401/403
- worker timeout
- invalid persisted token
- auth-required/human-required outcome

Run `npm run validate` before shipping.
