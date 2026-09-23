import assert from "node:assert/strict";
import test from "node:test";
import { KeyedQueue } from "../src/keyed-queue.js";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

test("serializes tasks with the same key in FIFO order", async () => {
  const queue = new KeyedQueue();
  const events = [];

  const first = queue.run("chat-1", async () => {
    events.push("first:start");
    await sleep(20);
    events.push("first:end");
  });

  const second = queue.run("chat-1", async () => {
    events.push("second:start");
    events.push("second:end");
  });

  assert.equal(queue.pendingFor("chat-1"), 2);
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
  assert.equal(queue.activeKeys, 0);
  assert.equal(queue.pendingTasks, 0);
});

test("allows different keys to run concurrently", async () => {
  const queue = new KeyedQueue();
  let active = 0;
  let maxActive = 0;

  const run = key => queue.run(key, async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(20);
    active -= 1;
  });

  await Promise.all([run("a"), run("b")]);
  assert.equal(maxActive, 2);
});

test("a rejected task does not block the next task", async () => {
  const queue = new KeyedQueue();

  await assert.rejects(
    queue.run("same", async () => {
      throw new Error("boom");
    }),
    /boom/
  );

  assert.equal(await queue.run("same", async () => 42), 42);
  assert.equal(queue.activeKeys, 0);
});

test("an aborted queued task releases the lane", async () => {
  const queue = new KeyedQueue();
  const controller = new AbortController();
  let releaseFirst;

  const first = queue.run("same", () => new Promise(resolve => {
    releaseFirst = resolve;
  }));
  const second = queue.run("same", async () => "never", { signal: controller.signal });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  releaseFirst();

  await first;
  await assert.rejects(second, error => error?.name === "AbortError");
  assert.equal(await queue.run("same", async () => "ok"), "ok");
});
