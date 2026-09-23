import { randomUUID } from "node:crypto";
import { sleep } from "./process-utils.js";

export async function waitForGenerationReady({
  readState,
  previousBootId = null,
  startedAfter = null,
  timeoutMs = 120_000,
  pollMs = 500,
} = {}) {
  if (typeof readState !== "function") {
    throw new Error("readState callback is required");
  }

  const afterMs = startedAfter
    ? new Date(startedAfter).getTime()
    : 0;
  const deadline = Date.now() + timeoutMs;
  let last = null;

  while (Date.now() < deadline) {
    last = await readState();

    const bootId = String(
      last?.bootId || ""
    );
    const startedAt = Date.parse(
      last?.startedAt || ""
    );
    const newGeneration =
      Boolean(bootId) &&
      (!previousBootId ||
        bootId !== previousBootId);
    const freshEnough =
      !afterMs ||
      (Number.isFinite(startedAt) &&
        startedAt >= afterMs);

    if (
      newGeneration &&
      freshEnough &&
      last?.ready === true
    ) {
      return {
        ready: true,
        state: last,
      };
    }

    await sleep(pollMs);
  }

  return {
    ready: false,
    state: last,
  };
}

export async function safeRestart({
  readState,
  stop,
  start,
  waitReady = null,
  timeoutMs = 120_000,
  pollMs = 500,
} = {}) {
  if (
    typeof readState !== "function" ||
    typeof stop !== "function" ||
    typeof start !== "function"
  ) {
    throw new Error(
      "readState, stop and start callbacks are required"
    );
  }

  const previous = await readState();
  const previousBootId =
    previous?.bootId || null;

  const stopped = await stop({
    previousState: previous,
  });

  if (stopped?.drained === false) {
    const error = new Error(
      "safe restart refused because the previous generation did not drain"
    );
    error.code = "DRAIN_INCOMPLETE";
    throw error;
  }

  const startedAfter =
    new Date().toISOString();
  const requestId = randomUUID();

  await start({
    previousState: previous,
    requestId,
    startedAfter,
  });

  const waiter =
    typeof waitReady === "function"
      ? waitReady
      : options =>
          waitForGenerationReady({
            ...options,
            readState,
          });

  const result = await waiter({
    readState,
    previousBootId,
    startedAfter,
    timeoutMs,
    pollMs,
    requestId,
  });

  if (!result?.ready) {
    const error = new Error(
      "replacement generation did not reach readiness"
    );
    error.code = "RESTART_NOT_READY";
    error.state = result?.state || null;
    throw error;
  }

  return {
    ready: true,
    previousBootId,
    bootId: result.state?.bootId || null,
    requestId,
    state: result.state,
  };
}
