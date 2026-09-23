import { spawn } from "node:child_process";

export function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

export function pidAlive(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) {
    return false;
  }

  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}

export function spawnManagedProcess({
  command,
  args = [],
  cwd = process.cwd(),
  env = process.env,
  stdio = ["ignore", "pipe", "pipe"],
  windowsHide = true,
} = {}) {
  if (!command) {
    throw new Error("process command is required");
  }

  return spawn(command, args, {
    cwd,
    env,
    stdio,
    windowsHide,
  });
}

export async function waitForProcessExit(
  childOrPid,
  timeoutMs = 10_000
) {
  const pid =
    typeof childOrPid === "number"
      ? childOrPid
      : childOrPid?.pid;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!pidAlive(pid)) return true;
    await sleep(50);
  }

  return !pidAlive(pid);
}

export async function drainProcess(
  child,
  {
    gracefulSignal = "SIGTERM",
    gracefulTimeoutMs = 8_000,
    forceSignal = "SIGKILL",
    forceTimeoutMs = 3_000,
    terminate = null,
  } = {}
) {
  if (!child?.pid || !pidAlive(child.pid)) {
    return {
      drained: true,
      escalated: false,
      pid: child?.pid || null,
    };
  }

  if (typeof terminate === "function") {
    await terminate({
      child,
      pid: child.pid,
      force: false,
    });
  } else {
    try {
      child.kill(gracefulSignal);
    } catch {
      // Verify below.
    }
  }

  if (
    await waitForProcessExit(
      child,
      gracefulTimeoutMs
    )
  ) {
    return {
      drained: true,
      escalated: false,
      pid: child.pid,
    };
  }

  if (typeof terminate === "function") {
    await terminate({
      child,
      pid: child.pid,
      force: true,
    });
  } else {
    try {
      child.kill(forceSignal);
    } catch {
      // Verify below.
    }
  }

  const drained = await waitForProcessExit(
    child,
    forceTimeoutMs
  );

  return {
    drained,
    escalated: true,
    pid: child.pid,
  };
}

export async function drainServices(
  records,
  options = {}
) {
  const results = [];

  for (const record of [...records].reverse()) {
    const result = await drainProcess(
      record?.child,
      {
        ...options,
        ...(record?.drainOptions || {}),
      }
    );

    results.push({
      name: record?.name || null,
      ...result,
    });
  }

  return {
    drained: results.every(
      result => result.drained
    ),
    results,
  };
}
