export function evaluateServiceReadiness({
  processAlive,
  expectedPid = null,
  expectedBootId = null,
  probe = null,
} = {}) {
  const reasons = [];

  if (processAlive !== true) {
    reasons.push({
      code: "PROCESS_DOWN",
      message: "Managed process is not alive",
    });
  }

  if (probe?.ready !== true) {
    const probeReasons = Array.isArray(
      probe?.reasons
    )
      ? probe.reasons
      : [];

    if (probeReasons.length) {
      reasons.push(...probeReasons);
    } else {
      reasons.push({
        code: "PROBE_NOT_READY",
        message:
          probe?.message ||
          "Application readiness probe is not ready",
      });
    }
  }

  if (
    expectedPid != null &&
    probe?.pid != null &&
    Number(probe.pid) !== Number(expectedPid)
  ) {
    reasons.push({
      code: "PID_MISMATCH",
      message:
        "Readiness belongs to a stale process",
    });
  }

  if (
    expectedBootId &&
    probe?.bootId &&
    String(probe.bootId) !==
      String(expectedBootId)
  ) {
    reasons.push({
      code: "BOOT_ID_MISMATCH",
      message:
        "Readiness belongs to another supervisor generation",
    });
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}

export function aggregateReadiness(results = []) {
  const reasons = [];

  for (const result of results) {
    if (result?.ready === true) continue;

    for (const reason of result?.reasons || []) {
      reasons.push({
        ...reason,
        service:
          reason?.service ||
          result?.service ||
          null,
      });
    }
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
