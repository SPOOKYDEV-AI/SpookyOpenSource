function withTimeout(promise, timeoutMs, label) {
  if (!timeoutMs || timeoutMs <= 0) return promise;

  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error(
        label + " timed out after " + timeoutMs + "ms"
      );
      error.code = "AUTH_RECOVERY_TIMEOUT";
      reject(error);
    }, timeoutMs);
    timer.unref?.();
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export class AuthRecoveryController {
  constructor({
    tokenManager,
    fallbackRefresh = null,
    verify = null,
    timeoutMs = 180_000,
    authRequiredCodes = ["AUTH_REQUIRED"],
    onState = null,
  } = {}) {
    if (!tokenManager) {
      throw new Error("tokenManager is required");
    }

    this.tokenManager = tokenManager;
    this.fallbackRefresh =
      typeof fallbackRefresh === "function"
        ? fallbackRefresh
        : null;
    this.verify =
      typeof verify === "function"
        ? verify
        : null;
    this.timeoutMs = Math.max(
      1_000,
      Number(timeoutMs) || 180_000
    );
    this.authRequiredCodes = new Set(
      authRequiredCodes.map(String)
    );
    this.onState =
      typeof onState === "function"
        ? onState
        : null;
    this.pending = null;
    this.state = {
      status: "idle",
      attempts: 0,
      successes: 0,
      failures: 0,
      lastReason: null,
      lastError: null,
      lastAt: null,
    };
  }

  snapshot() {
    return {
      ...this.state,
      auth: this.tokenManager.status(),
    };
  }

  async setState(status, patch = {}) {
    this.state = {
      ...this.state,
      ...patch,
      status,
      lastAt: new Date().toISOString(),
    };

    if (this.onState) {
      await this.onState(this.snapshot());
    }
  }

  async recover({
    reason = "manual",
    force = true,
  } = {}) {
    if (this.pending) return this.pending;

    this.pending = withTimeout(
      this.runRecovery({ reason, force }),
      this.timeoutMs,
      "Auth recovery"
    );

    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  async runRecovery({ reason, force }) {
    this.state.attempts += 1;
    await this.setState("recovering", {
      lastReason: reason,
      lastError: null,
    });

    let primaryError = null;

    try {
      await this.tokenManager.getToken({
        forceRefresh: force,
      });

      if (await this.isHealthy()) {
        this.state.successes += 1;
        await this.setState("healthy");
        return {
          ok: true,
          path: "direct-refresh",
          auth: this.tokenManager.status(),
        };
      }
    } catch (error) {
      primaryError = error;
    }

    if (this.fallbackRefresh) {
      try {
        await this.setState("fallback-refresh", {
          lastError: primaryError
            ? String(primaryError.message || primaryError)
            : null,
        });

        const result = await this.fallbackRefresh({
          reason,
          primaryError,
        });

        // The fallback may persist a token externally (for example via a
        // Windows interactive worker). Reload or refresh the manager after it.
        if (typeof result === "string" || result?.token) {
          const refresh = this.tokenManager.refresh;
          if (typeof refresh === "function") {
            const previous = this.tokenManager.refresh;
            this.tokenManager.refresh = async () => result;
            try {
              await this.tokenManager.getToken({ forceRefresh: true });
            } finally {
              this.tokenManager.refresh = previous;
            }
          }
        } else {
          // For file-backed stores, recreating the manager is often not
          // necessary: applications can expose reloadFromStore() or make
          // verify() read the shared persisted auth state.
          await this.tokenManager.getToken({
            forceRefresh: true,
          });
        }

        if (await this.isHealthy()) {
          this.state.successes += 1;
          await this.setState("healthy");
          return {
            ok: true,
            path: "fallback-refresh",
            auth: this.tokenManager.status(),
          };
        }
      } catch (error) {
        primaryError = error;
      }
    }

    this.state.failures += 1;
    const code = String(
      primaryError?.code ||
        primaryError?.cause?.code ||
        ""
    );
    const status = this.authRequiredCodes.has(code)
      ? "auth-required"
      : "degraded";

    await this.setState(status, {
      lastError: primaryError
        ? String(primaryError.message || primaryError)
        : "Authentication recovery did not produce a valid token",
    });

    return {
      ok: false,
      path: "failed",
      error: primaryError,
      auth: this.tokenManager.status(),
    };
  }

  async isHealthy() {
    const auth = this.tokenManager.status();
    if (auth.valid !== true) return false;

    if (!this.verify) return true;

    const result = await this.verify({
      auth,
      tokenManager: this.tokenManager,
    });

    return result === true || result?.ready === true;
  }
}
