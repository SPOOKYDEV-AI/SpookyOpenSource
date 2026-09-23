function createAbortError(signal) {
  if (signal?.reason instanceof Error) return signal.reason;
  const error = new Error("Operation aborted");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw createAbortError(signal);
}

export class KeyedQueue {
  #tails = new Map();
  #pending = new Map();

  async run(key, task, { signal } = {}) {
    if (typeof task !== "function") {
      throw new TypeError("task must be a function");
    }

    throwIfAborted(signal);

    const queueKey = String(key);
    const previous = this.#tails.get(queueKey) ?? Promise.resolve();

    let release;
    const current = new Promise(resolve => {
      release = resolve;
    });

    const tail = previous.catch(() => {}).then(() => current);
    this.#tails.set(queueKey, tail);
    this.#pending.set(queueKey, (this.#pending.get(queueKey) ?? 0) + 1);

    try {
      await previous.catch(() => {});
      throwIfAborted(signal);
      return await task();
    } finally {
      release();

      const pending = (this.#pending.get(queueKey) ?? 1) - 1;
      if (pending > 0) this.#pending.set(queueKey, pending);
      else this.#pending.delete(queueKey);

      if (this.#tails.get(queueKey) === tail) {
        this.#tails.delete(queueKey);
      }
    }
  }

  pendingFor(key) {
    return this.#pending.get(String(key)) ?? 0;
  }

  get activeKeys() {
    return this.#tails.size;
  }

  get pendingTasks() {
    let total = 0;
    for (const count of this.#pending.values()) total += count;
    return total;
  }
}
