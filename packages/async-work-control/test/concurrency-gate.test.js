import assert from "node:assert/strict";
import test from "node:test";
import { ConcurrencyGate } from "../src/concurrency-gate.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("never exceeds the configured concurrency", async () => {
  const gate = new ConcurrencyGate(2);
  let active = 0;
  let maxActive = 0;

  await Promise.all(Array.from({ length: 8 }, (_, index) => gate.run(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(5 + (index % 2));
    active -= 1;
  })));

  assert.equal(maxActive, 2);
  assert.equal(gate.active, 0);
  assert.equal(gate.pending, 0);
});

test("releases capacity when a task throws", async () => {
  const gate = new ConcurrencyGate(1);
  await assert.rejects(gate.run(async () => { throw new Error("boom"); }), /boom/);
  assert.equal(await gate.run(async () => 7), 7);
});

test("can abort a waiter without consuming capacity", async () => {
  const gate = new ConcurrencyGate(1);
  const controller = new AbortController();
  let releaseFirst;

  const first = gate.run(() => new Promise(resolve => { releaseFirst = resolve; }));
  const second = gate.run(async () => "never", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(gate.active, 1);
  assert.equal(gate.pending, 1);
  controller.abort();
  await assert.rejects(second, error => error?.name === "AbortError");
  assert.equal(gate.pending, 0);

  releaseFirst();
  await first;
  assert.equal(gate.active, 0);
});
