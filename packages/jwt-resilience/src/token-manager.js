import { parseJwtExpiryMs } from "./jwt.js";

export class JwtTokenManager {
  constructor({
    staticToken = "",
    store = null,
    refresh = null,
    skewMs = 60_000,
    maxSkewFraction = 0.10,
    fallbackTtlMs = 5 * 60_000,
  } = {}) {
    this.staticToken = String(staticToken || "").trim();
    this.store = store;
    this.refresh =
      typeof refresh === "function"
        ? refresh
        : null;
    this.skewMs = Math.max(0, Number(skewMs) || 0);
    this.maxSkewFraction = Math.min(
      0.9,
      Math.max(0.01, Number(maxSkewFraction) || 0.10)
    );
    this.fallbackTtlMs = Math.max(
      30_000,
      Number(fallbackTtlMs) || 5 * 60_000
    );
    this.cached =
      this.staticToken
        ? null
        : this.store?.load?.() || null;
    this.pending = null;
  }

  get canRefresh() {
    return Boolean(this.refresh);
  }

  status() {
    const staticEntry = this.staticToken
      ? {
          token: this.staticToken,
          expiresAt: parseJwtExpiryMs(
            this.staticToken
          ),
          updatedAt: 0,
          source: "static",
        }
      : null;

    const current = this.cached?.token
      ? this.cached
      : staticEntry;
    const expiresAt =
      Number(current?.expiresAt) || 0;
    const effectiveSkewMs =
      this.effectiveSkewMs(current);
    const expired = Boolean(
      current?.token &&
      expiresAt &&
      Date.now() + effectiveSkewMs >= expiresAt
    );

    return {
      configured: Boolean(
        current?.token || this.refresh
      ),
      source:
        expired && current?.source
          ? current.source + "-expired"
          : current?.source ||
            (this.refresh ? "refreshable" : "none"),
      expiresAt: expiresAt || null,
      expiresInMs: expiresAt
        ? expiresAt - Date.now()
        : null,
      updatedAt:
        Number(current?.updatedAt) || null,
      effectiveSkewMs,
      expired,
      valid: Boolean(
        current?.token &&
        (!expiresAt || !expired)
      ),
      refreshable: this.canRefresh,
    };
  }

  async getToken({ forceRefresh = false } = {}) {
    if (
      !forceRefresh &&
      this.cached?.token &&
      !this.isExpired(this.cached)
    ) {
      return this.cached.token;
    }

    if (this.staticToken && !forceRefresh) {
      const entry = {
        token: this.staticToken,
        expiresAt: parseJwtExpiryMs(
          this.staticToken
        ),
        updatedAt: 0,
        source: "static",
      };

      if (
        !entry.expiresAt ||
        !this.isExpired(entry) ||
        !this.refresh
      ) {
        return this.staticToken;
      }
    }

    if (!this.refresh) {
      if (this.staticToken) return this.staticToken;
      const error = new Error(
        "No valid token is available and automatic refresh is not configured"
      );
      error.code = "AUTH_REQUIRED";
      throw error;
    }

    if (this.pending) return this.pending;

    this.pending = this.refreshToken();
    try {
      return await this.pending;
    } finally {
      this.pending = null;
    }
  }

  invalidate() {
    this.cached = null;
    this.store?.clear?.();
  }

  effectiveSkewMs(entry) {
    const expiresAt =
      Number(entry?.expiresAt) || 0;
    if (!expiresAt) return 0;

    const updatedAt =
      Number(entry?.updatedAt) || 0;
    const lifetimeMs =
      updatedAt > 0 && expiresAt > updatedAt
        ? expiresAt - updatedAt
        : 0;

    if (lifetimeMs > 0) {
      return Math.min(
        this.skewMs,
        Math.max(
          5_000,
          Math.floor(
            lifetimeMs * this.maxSkewFraction
          )
        )
      );
    }

    return Math.min(this.skewMs, 30_000);
  }

  isExpired(entry) {
    if (!entry?.expiresAt) return false;
    return (
      Date.now() + this.effectiveSkewMs(entry) >=
      Number(entry.expiresAt)
    );
  }

  async refreshToken() {
    const result = await this.refresh();
    const token =
      typeof result === "string"
        ? result.trim()
        : String(result?.token || "").trim();

    if (!token || token.length < 20) {
      const error = new Error(
        "Refresh returned an invalid token"
      );
      error.code = "AUTH_REFRESH_INVALID";
      throw error;
    }

    const parsedExpiry = parseJwtExpiryMs(token);
    const explicitExpiry = Number(
      result?.expiresAt
    );
    const expiresAt =
      Number.isFinite(explicitExpiry) &&
      explicitExpiry > 0
        ? explicitExpiry
        : parsedExpiry ||
          Date.now() + this.fallbackTtlMs;

    this.cached = {
      token,
      expiresAt,
      updatedAt: Date.now(),
      source: String(
        result?.source || "refresh"
      ),
    };

    this.store?.save?.(this.cached);
    return token;
  }
}
