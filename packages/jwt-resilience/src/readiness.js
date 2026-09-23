export function evaluateAuthReadiness({
  auth,
  checks = [],
} = {}) {
  const reasons = [];

  if (auth?.valid !== true) {
    reasons.push({
      code: "AUTH_NOT_READY",
      message: "Authentication is not valid",
    });
  }

  for (const check of checks) {
    if (check?.ready === true) continue;

    reasons.push({
      code:
        String(
          check?.code || "DEPENDENCY_NOT_READY"
        ),
      message:
        String(
          check?.message ||
            check?.name ||
            "A dependency is not ready"
        ),
    });
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
