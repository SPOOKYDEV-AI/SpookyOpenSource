import test from "node:test";
import assert from "node:assert/strict";
import { RestartBudget } from "../src/index.js";

test("restart budget opens a circuit after the configured budget", () => {
  const budget = new RestartBudget({
    maxRestarts: 2,
    windowMs: 60_000,
    circuitOpenMs: 30_000,
  });

  const now = 1_000_000;
  assert.equal(budget.canRestart(now), true);
  assert.equal(budget.record(now), true);
  assert.equal(budget.canRestart(now + 1), true);
  assert.equal(budget.record(now + 1), true);

  const snapshot = budget.snapshot(now + 2);
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.attemptsInWindow, 2);
  assert.equal(budget.canRestart(now + 2), false);

  assert.equal(
    budget.canRestart(now + 30_001),
    false
  );

  assert.equal(
    budget.canRestart(now + 60_001),
    true
  );
});
