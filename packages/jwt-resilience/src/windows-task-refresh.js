import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function sleep(ms) {
  return new Promise(resolvePromise =>
    setTimeout(resolvePromise, ms)
  );
}

function readJson(file) {
  try {
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr?.on("data", chunk => {
      stderr += chunk;
    });

    child.once("error", reject);
    child.once("exit", code => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }

      const error = new Error(
        command +
          " exited with code " +
          code +
          (stderr ? ": " + stderr.trim() : "")
      );
      error.code = "WORKER_LAUNCH_FAILED";
      reject(error);
    });
  });
}

export function createWindowsTaskRefresher({
  taskName,
  stateFile,
  readToken,
  timeoutMs = 120_000,
  pollMs = 500,
} = {}) {
  if (!taskName) {
    throw new Error("taskName is required");
  }
  if (!stateFile) {
    throw new Error("stateFile is required");
  }
  if (typeof readToken !== "function") {
    throw new Error("readToken callback is required");
  }

  const absoluteStateFile = resolve(stateFile);

  return async function refreshWithWindowsTask() {
    if (process.platform !== "win32") {
      const error = new Error(
        "Windows scheduled-task refresh is only available on Windows"
      );
      error.code = "WORKER_UNAVAILABLE";
      throw error;
    }

    const requestedAt = Date.now();
    await run("schtasks.exe", [
      "/Run",
      "/TN",
      taskName,
    ]);

    const deadline = requestedAt + timeoutMs;

    while (Date.now() < deadline) {
      const state = readJson(absoluteStateFile);
      const startedAt = Date.parse(
        state?.startedAt ||
          state?.updatedAt ||
          ""
      );
      const finishedAt = Date.parse(
        state?.finishedAt || ""
      );

      const belongsToRequest =
        (
          Number.isFinite(finishedAt) &&
          finishedAt >= requestedAt - 5_000
        ) ||
        (
          Number.isFinite(startedAt) &&
          startedAt >= requestedAt - 5_000
        );

      if (belongsToRequest) {
        if (state?.status === "success") {
          const token = await readToken();
          if (!token) {
            const error = new Error(
              "Worker succeeded but no token was available"
            );
            error.code = "WORKER_TOKEN_MISSING";
            throw error;
          }
          return token;
        }

        if (
          state?.status === "failed" ||
          state?.status === "human-required"
        ) {
          const error = new Error(
            state?.error ||
              "Refresh worker failed"
          );
          error.code =
            state?.code ||
            (state?.status === "human-required"
              ? "AUTH_REQUIRED"
              : "WORKER_FAILED");
          throw error;
        }
      }

      await sleep(pollMs);
    }

    const error = new Error(
      "Timed out waiting for refresh worker"
    );
    error.code = "WORKER_TIMEOUT";
    throw error;
  };
}
