function createAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

export class ConcurrencyGate {
  #active = 0;
  #waiters = [];

  constructor(maxConcurrent) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent <= 0) {
      throw new RangeError("maxConcurrent must be a positive integer");
    }
    this.maxConcurrent = maxConcurrent;
  }

  async run(task, { signal } = {}) {
    if (typeof task !== "function") {
      throw new TypeError("task must be a function");
    }

    await this.#acquire(signal);
    try {
      return await task();
    } finally {
      this.#release();
    }
  }

  async #acquire(signal) {
    if (signal?.aborted) throw createAbortError(signal);

    if (this.#active < this.maxConcurrent) {
      this.#active += 1;
      return;
    }

    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, signal, onAbort: null };

      if (signal) {
        waiter.onAbort = () => {
          const index = this.#waiters.indexOf(waiter);
          if (index !== -1) this.#waiters.splice(index, 1);
          reject(createAbortError(signal));
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
      }

      this.#waiters.push(waiter);
    });

    this.#active += 1;
  }

  #release() {
    this.#active -= 1;
    const next = this.#waiters.shift();
    if (!next) return;

    if (next.signal && next.onAbort) {
      next.signal.removeEventListener("abort", next.onAbort);
    }
    next.resolve();
  }

  get active() {
    return this.#active;
  }

  get pending() {
    return this.#waiters.length;
  }
}
