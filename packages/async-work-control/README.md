# @spookyopensource/async-work-control

Small dependency-free primitives for keeping asynchronous Node.js workloads bounded and predictable.

## What it solves

- serialize work for one logical resource without blocking unrelated resources
- cap global concurrency to protect CPUs, databases and upstream services
- enforce an in-memory sliding-window request budget
- recover cleanly when tasks reject
- cancel queued work with `AbortSignal`
- expose lightweight queue/gate metrics for readiness and observability

## Quick start

```js
import {
  ConcurrencyGate,
  KeyedQueue,
  SlidingWindowLimiter,
} from "@spookyopensource/async-work-control";

const perAccount = new KeyedQueue();
const upstream = new ConcurrencyGate(8);
const limiter = new SlidingWindowLimiter({
  limit: 100,
  windowMs: 60_000,
});

async function handle(accountId, job, signal) {
  if (!limiter.tryTake()) {
    throw new Error(`Rate limited for ${limiter.retryAfterMs()}ms`);
  }

  return perAccount.run(accountId, () =>
    upstream.run(() => job(), { signal }),
    { signal }
  );
}
```

## KeyedQueue

`KeyedQueue` guarantees FIFO execution for tasks sharing the same key. Different keys are independent and may execute concurrently. Rejections do not poison the lane, and empty lanes are removed automatically.

Useful introspection:

- `activeKeys`: number of keys with queued or running work
- `pendingTasks`: total queued + running tasks
- `pendingFor(key)`: queued + running tasks for one key

## ConcurrencyGate

`ConcurrencyGate` limits the number of tasks executing at once. Waiters are FIFO, task failures release capacity in `finally`, and an aborted waiter is removed without consuming a slot.

Useful introspection:

- `active`: tasks currently holding capacity
- `pending`: tasks waiting for capacity

## SlidingWindowLimiter

`SlidingWindowLimiter` provides a dependency-free in-memory rolling window. It is appropriate for one process. It is not a distributed quota system; use a shared durable backend when multiple processes must enforce one common budget.

- `tryTake(now?)`
- `remaining(now?)`
- `retryAfterMs(now?)`
- `reset()`

## Design constraints

The package is deliberately small: no provider-specific behavior, no background timers and no hidden retries. Callers retain control of persistence, distributed coordination and retry policy.

## License

MIT.
