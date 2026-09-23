import assert from "node:assert/strict";
import test from "node:test";
import { SlidingWindowLimiter } from "../src/sliding-window-limiter.js";

test("enforces a sliding-window limit and exposes retry delay", () => {
  const limiter = new SlidingWindowLimiter({ limit: 2, windowMs: 1000 });

  assert.equal(limiter.tryTake(1000), true);
  assert.equal(limiter.tryTake(1200), true);
  assert.equal(limiter.tryTake(1300), false);
  assert.equal(limiter.remaining(1300), 0);
  assert.equal(limiter.retryAfterMs(1300), 700);

  assert.equal(limiter.tryTake(2000), true);
  assert.equal(limiter.remaining(2000), 0);
});

test("reset clears the window", () => {
  const limiter = new SlidingWindowLimiter({ limit: 1, windowMs: 1000 });
  assert.equal(limiter.tryTake(1), true);
  assert.equal(limiter.tryTake(2), false);
  limiter.reset();
  assert.equal(limiter.remaining(2), 1);
  assert.equal(limiter.retryAfterMs(2), 0);
});

test("rejects invalid configuration", () => {
  assert.throws(() => new SlidingWindowLimiter({ limit: 0, windowMs: 1 }), RangeError);
  assert.throws(() => new SlidingWindowLimiter({ limit: 1, windowMs: 0 }), RangeError);
});
