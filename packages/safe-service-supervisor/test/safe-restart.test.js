import test from "node:test";
import assert from "node:assert/strict";
import { safeRestart } from "../src/index.js";

test("safe restart requires a new ready generation", async () => {
  let state = {
    bootId: "old",
    startedAt: new Date(Date.now() - 5000).toISOString(),
    ready: true,
  };

  const result = await safeRestart({
    readState: () => state,
    stop: async () => ({ drained: true }),
    start: async () => {
      state = {
        bootId: "new",
        startedAt: new Date(Date.now() + 5).toISOString(),
        ready: true,
      };
    },
    timeoutMs: 1000,
    pollMs: 10,
  });

  assert.equal(result.ready, true);
  assert.equal(result.previousBootId, "old");
  assert.equal(result.bootId, "new");
});

test("safe restart refuses incomplete drain", async () => {
  await assert.rejects(
    () => safeRestart({
      readState: () => ({
        bootId: "old",
        ready: true,
      }),
      stop: async () => ({ drained: false }),
      start: async () => {},
      timeoutMs: 100,
    }),
    error => error.code === "DRAIN_INCOMPLETE"
  );
});
