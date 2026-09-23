function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

export class AuthSupervisor {
  constructor({
    tokenManager,
    intervalMs = 60_000,
    refreshBeforeMs = 20 * 60_000,
    recoveryCooldownMs = 60_000,
    maxRecoveriesPerWindow = 6,
    recoveryWindowMs = 15 * 60_000,
    circuitOpenMs = 5 * 60_000,
    authRequiredCodes = ["AUTH_REQUIRED"],
    onTransition = null,
  } = {}) {
    if (!tokenManager) {
      throw new Error("tokenManager is required");
    }

    this.tokenManager = tokenManager;
    this.intervalMs = Math.max(
      1_000,
      Number(intervalMs) || 60_000
    );
    this.refreshBeforeMs = Math.max(
      0,
      Number(refreshBeforeMs) || 0
    );
    this.recoveryCooldownMs = Math.max(
      0,
      Number(recoveryCooldownMs) || 0
    );
    this.maxRecoveriesPerWindow = Math.max(
      1,
      Number(maxRecoveriesPerWindow) || 6
    );
    this.recoveryWindowMs = Math.max(
      1_000,
      Number(recoveryWindowMs) || 15 * 60_000
    );
    this.circuitOpenMs = Math.max(
      1_000,
      Number(circuitOpenMs) || 5 * 60_000
    );
    this.authRequiredCodes = new Set(
      authRequiredCodes.map(String)
    );
    this.onTransition =
      typeof onTransition === "function"
        ? onTransition
        : null;

    this.timer = null;
    this.inFlight = null;
    this.lastRecoveryAt = 0;
    this.recoveryHistory = [];
    this.circuitUntil = 0;
    this.state = {
      status: "starting",
      previousStatus: null,
      lastTransitionAt: new Date().toISOString(),
      lastCheckAt: null,
      lastRefreshAt: null,
      lastError: null,
      recoveryAttempts: 0,
      recoverySuccesses: 0,
      recoveryFailures: 0,
    };
  }

  snapshot() {
    return {
      ...this.state,
      circuitUntil:
        this.circuitUntil || null,
      auth: this.tokenManager.status(),
    };
  }

  start() {
    if (this.timer) return;

    void this.tick();
    this.timer = setInterval(
      () => void this.tick(),
      this.intervalMs
    );
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick() {
    this.state.lastCheckAt =
      new Date().toISOString();

    if (
      this.circuitUntil &&
      Date.now() < this.circuitUntil
    ) {
      await this.transition("circuit-open");
      return false;
    }

    if (
      this.circuitUntil &&
      Date.now() >= this.circuitUntil
    ) {
      this.circuitUntil = 0;
    }

    const auth = this.tokenManager.status();
    const needsRefresh =
      auth.valid !== true ||
      (
        Number.isFinite(auth.expiresInMs) &&
        auth.expiresInMs <= this.refreshBeforeMs
      );

    if (!needsRefresh) {
      this.state.lastError = null;
      await this.transition("healthy");
      return true;
    }

    return this.recover(
      auth.valid ? "preemptive" : "invalid"
    );
  }

  async recover(reason = "manual") {
    if (this.inFlight) return this.inFlight;

    const now = Date.now();
    if (
      this.lastRecoveryAt &&
      now - this.lastRecoveryAt <
        this.recoveryCooldownMs
    ) {
      return false;
    }

    this.pruneRecoveryHistory();
    if (
      this.recoveryHistory.length >=
      this.maxRecoveriesPerWindow
    ) {
      this.circuitUntil =
        now + this.circuitOpenMs;
      await this.transition(
        "circuit-open",
        "recovery budget exhausted"
      );
      return false;
    }

    this.lastRecoveryAt = now;
    this.recoveryHistory.push(now);
    this.state.recoveryAttempts += 1;

    this.inFlight = (async () => {
      try {
        await this.transition(
          "recovering",
          reason
        );

        await this.tokenManager.getToken({
          forceRefresh: true,
        });

        const auth =
          this.tokenManager.status();
        if (auth.valid !== true) {
          throw new Error(
            "Refresh completed but auth is still not valid"
          );
        }

        this.state.recoverySuccesses += 1;
        this.state.lastRefreshAt =
          new Date().toISOString();
        this.state.lastError = null;
        await this.transition("healthy");
        return true;
      } catch (error) {
        this.state.recoveryFailures += 1;
        this.state.lastError =
          error instanceof Error
            ? error.message
            : String(error);

        const code = String(
          error?.code ||
            error?.cause?.code ||
            ""
        );

        await this.transition(
          this.authRequiredCodes.has(code)
            ? "auth-required"
            : "degraded",
          this.state.lastError
        );
        return false;
      } finally {
        this.inFlight = null;
      }
    })();

    return this.inFlight;
  }

  pruneRecoveryHistory() {
    const cutoff =
      Date.now() - this.recoveryWindowMs;
    this.recoveryHistory =
      this.recoveryHistory.filter(
        timestamp => timestamp >= cutoff
      );
  }

  async transition(next, detail = "") {
    if (this.state.status === next) return;

    const previous = this.state.status;
    this.state.previousStatus = previous;
    this.state.status = next;
    this.state.lastTransitionAt =
      new Date().toISOString();

    if (this.onTransition) {
      await this.onTransition({
        previous,
        next,
        detail,
        snapshot: this.snapshot(),
      });
    }
  }
}

export { sleep };
