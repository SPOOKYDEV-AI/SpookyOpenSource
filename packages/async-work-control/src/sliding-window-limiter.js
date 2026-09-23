export class SlidingWindowLimiter {
  #timestamps = [];
  #head = 0;

  constructor({ limit, windowMs }) {
    if (!Number.isInteger(limit) || limit <= 0) {
      throw new RangeError("limit must be a positive integer");
    }
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new RangeError("windowMs must be > 0");
    }

    this.limit = limit;
    this.windowMs = windowMs;
  }

  #prune(now) {
    const threshold = now - this.windowMs;
    while (
      this.#head < this.#timestamps.length &&
      this.#timestamps[this.#head] <= threshold
    ) {
      this.#head += 1;
    }

    if (this.#head > 64 && this.#head * 2 >= this.#timestamps.length) {
      this.#timestamps = this.#timestamps.slice(this.#head);
      this.#head = 0;
    }
  }

  get size() {
    return this.#timestamps.length - this.#head;
  }

  remaining(now = Date.now()) {
    this.#prune(now);
    return Math.max(0, this.limit - this.size);
  }

  retryAfterMs(now = Date.now()) {
    this.#prune(now);
    if (this.size < this.limit) return 0;
    return Math.max(0, this.#timestamps[this.#head] + this.windowMs - now);
  }

  tryTake(now = Date.now()) {
    this.#prune(now);
    if (this.size >= this.limit) return false;
    this.#timestamps.push(now);
    return true;
  }

  reset() {
    this.#timestamps = [];
    this.#head = 0;
  }
}
