import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAuthReadiness } from "../src/index.js";

test("readiness requires valid auth", () => {
  assert.equal(
    evaluateAuthReadiness({
      auth: { valid: true },
    }).ready,
    true
  );

  const failed = evaluateAuthReadiness({
    auth: { valid: false },
  });

  assert.equal(failed.ready, false);
  assert.equal(
    failed.reasons[0].code,
    "AUTH_NOT_READY"
  );
});

test("readiness can include application dependencies", () => {
  const result = evaluateAuthReadiness({
    auth: { valid: true },
    checks: [
      {
        ready: false,
        code: "CATALOG_STALE",
        message: "catalog is not live",
      },
    ],
  });

  assert.equal(result.ready, false);
  assert.equal(
    result.reasons[0].code,
    "CATALOG_STALE"
  );
});
