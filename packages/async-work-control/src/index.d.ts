export interface RunOptions {
  signal?: AbortSignal;
}

export class KeyedQueue {
  run<T>(key: unknown, task: () => T | Promise<T>, options?: RunOptions): Promise<T>;
  pendingFor(key: unknown): number;
  readonly activeKeys: number;
  readonly pendingTasks: number;
}

export class ConcurrencyGate {
  constructor(maxConcurrent: number);
  readonly maxConcurrent: number;
  run<T>(task: () => T | Promise<T>, options?: RunOptions): Promise<T>;
  readonly active: number;
  readonly pending: number;
}

export class SlidingWindowLimiter {
  constructor(options: { limit: number; windowMs: number });
  readonly limit: number;
  readonly windowMs: number;
  readonly size: number;
  remaining(now?: number): number;
  retryAfterMs(now?: number): number;
  tryTake(now?: number): boolean;
  reset(): void;
}
