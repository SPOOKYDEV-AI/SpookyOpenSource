export function parseJwtExpiryMs(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return 0;

    const normalized = parts[1]
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded =
      normalized +
      "=".repeat(
        (4 - (normalized.length % 4)) % 4
      );

    const payload = JSON.parse(
      Buffer.from(padded, "base64").toString("utf8")
    );
    const exp = Number(payload?.exp);

    return Number.isFinite(exp)
      ? exp * 1000
      : 0;
  } catch {
    return 0;
  }
}
