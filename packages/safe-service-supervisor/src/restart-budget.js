export class RestartBudget {
  constructor({
    maxRestarts = 6,
    windowMs = 15 * 60_000,
    circuitOpenMs = 5 * 60_000,
  } = {}) {
    this.maxRestarts = Math.max(
      1,
      Number(maxRestarts) || 6
    );
    this.windowMs = Math.max(
      1_000,
      Number(windowMs) || 15 * 60_000
    );
    this.circuitOpenMs = Math.max(
      1_000,
      Number(circuitOpenMs) || 5 * 60_000
    );
    this.history = [];
    this.circuitUntil = 0;
  }

  prune(now = Date.now()) {
    const cutoff = now - this.windowMs;
    this.history = this.history.filter(
      value => value >= cutoff
    );

    if (
      this.circuitUntil &&
      now >= this.circuitUntil
    ) {
      this.circuitUntil = 0;
    }
  }

  snapshot(now = Date.now()) {
    this.prune(now);
    return {
      attemptsInWindow: this.history.length,
      maxRestarts: this.maxRestarts,
      windowMs: this.windowMs,
      circuitOpenMs: this.circuitOpenMs,
      circuitUntil: this.circuitUntil || null,
      open:
        Boolean(this.circuitUntil) &&
        now < this.circuitUntil,
    };
  }

  canRestart(now = Date.now()) {
    const state = this.snapshot(now);
    return (
      !state.open &&
      state.attemptsInWindow <
        this.maxRestarts
    );
  }

  record(now = Date.now()) {
    this.prune(now);

    if (
      this.circuitUntil &&
      now < this.circuitUntil
    ) {
      return false;
    }

    if (
      this.history.length >=
      this.maxRestarts
    ) {
      this.circuitUntil =
        now + this.circuitOpenMs;
      return false;
    }

    this.history.push(now);

    if (
      this.history.length >=
      this.maxRestarts
    ) {
      this.circuitUntil =
        now + this.circuitOpenMs;
    }

    return true;
  }

  reset() {
    this.history = [];
    this.circuitUntil = 0;
  }
}
