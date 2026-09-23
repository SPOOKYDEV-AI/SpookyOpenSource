import test from "node:test";
import assert from "node:assert/strict";
import { AuthSupervisor } from "../src/index.js";

test("supervisor refreshes before expiry", async () => {
  let refreshed = 0;
  let valid = true;
  let expiresInMs = 5_000;

  const manager = {
    canRefresh: true,
    status() {
      return {
        valid,
        expiresInMs,
      };
    },
    async getToken({ forceRefresh }) {
      assert.equal(forceRefresh, true);
      refreshed += 1;
      valid = true;
      expiresInMs = 60 * 60_000;
      return "token";
    },
  };

  const supervisor = new AuthSupervisor({
    tokenManager: manager,
    refreshBeforeMs: 10_000,
    recoveryCooldownMs: 0,
  });

  const ok = await supervisor.tick();

  assert.equal(ok, true);
  assert.equal(refreshed, 1);
  assert.equal(
    supervisor.snapshot().status,
    "healthy"
  );
});

test("supervisor exposes auth-required without looping", async () => {
  let calls = 0;
  const manager = {
    canRefresh: true,
    status() {
      return {
        valid: false,
        expiresInMs: -1,
      };
    },
    async getToken() {
      calls += 1;
      const error = new Error(
        "human login required"
      );
      error.code = "AUTH_REQUIRED";
      throw error;
    },
  };

  const supervisor = new AuthSupervisor({
    tokenManager: manager,
    recoveryCooldownMs: 60_000,
  });

  assert.equal(await supervisor.tick(), false);
  assert.equal(
    supervisor.snapshot().status,
    "auth-required"
  );

  assert.equal(await supervisor.tick(), false);
  assert.equal(calls, 1);
});
