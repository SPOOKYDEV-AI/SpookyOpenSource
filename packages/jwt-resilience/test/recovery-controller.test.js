import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthRecoveryController,
  JwtTokenManager,
} from "../src/index.js";

function token(expSeconds = 3600) {
  const enc = value =>
    Buffer.from(JSON.stringify(value))
      .toString("base64url");
  return [
    enc({ alg: "none" }),
    enc({ exp: Math.floor(Date.now() / 1000) + expSeconds }),
    "sig",
  ].join(".");
}

test("recover succeeds through direct refresh", async () => {
  let calls = 0;
  const manager = new JwtTokenManager({
    refresh: async () => {
      calls += 1;
      return token();
    },
  });

  const recovery = new AuthRecoveryController({
    tokenManager: manager,
  });

  const result = await recovery.recover();

  assert.equal(result.ok, true);
  assert.equal(result.path, "direct-refresh");
  assert.equal(calls, 1);
  assert.equal(recovery.snapshot().status, "healthy");
});

test("recover falls back to worker result when direct refresh fails", async () => {
  let directCalls = 0;
  let workerCalls = 0;

  const manager = new JwtTokenManager({
    refresh: async () => {
      directCalls += 1;
      const error = new Error("direct refresh unavailable");
      error.code = "AUTH_TRANSIENT";
      throw error;
    },
  });

  const recovery = new AuthRecoveryController({
    tokenManager: manager,
    fallbackRefresh: async () => {
      workerCalls += 1;
      return {
        token: token(),
        source: "worker",
      };
    },
  });

  const result = await recovery.recover();

  assert.equal(result.ok, true);
  assert.equal(result.path, "fallback-refresh");
  assert.equal(directCalls, 1);
  assert.equal(workerCalls, 1);
  assert.equal(manager.status().valid, true);
});

test("concurrent recover callers share one recovery", async () => {
  let calls = 0;
  const manager = new JwtTokenManager({
    refresh: async () => {
      calls += 1;
      await new Promise(resolve => setTimeout(resolve, 20));
      return token();
    },
  });

  const recovery = new AuthRecoveryController({
    tokenManager: manager,
  });

  const results = await Promise.all([
    recovery.recover(),
    recovery.recover(),
    recovery.recover(),
  ]);

  assert.equal(calls, 1);
  assert.ok(results.every(item => item.ok));
});
