import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateReadiness,
  evaluateServiceReadiness,
} from "../src/index.js";

test("readiness rejects stale pid and boot generation", () => {
  const result = evaluateServiceReadiness({
    processAlive: true,
    expectedPid: 123,
    expectedBootId: "new-boot",
    probe: {
      ready: true,
      pid: 999,
      bootId: "old-boot",
    },
  });

  assert.equal(result.ready, false);
  assert.deepEqual(
    result.reasons.map(item => item.code).sort(),
    ["BOOT_ID_MISMATCH", "PID_MISMATCH"]
  );
});

test("aggregate readiness preserves service context", () => {
  const result = aggregateReadiness([
    {
      service: "api",
      ready: true,
      reasons: [],
    },
    {
      service: "worker",
      ready: false,
      reasons: [{
        code: "NOT_READY",
        message: "warming up",
      }],
    },
  ]);

  assert.equal(result.ready, false);
  assert.equal(result.reasons[0].service, "worker");
});
