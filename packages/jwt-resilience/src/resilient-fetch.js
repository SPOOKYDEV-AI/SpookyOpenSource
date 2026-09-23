export class AuthHttpError extends Error {
  constructor(message, {
    status = null,
    body = "",
    code = null,
    recoveryAttempted = false,
  } = {}) {
    super(message);
    this.name = "AuthHttpError";
    this.status = status;
    this.body = body;
    this.code = code;
    this.recoveryAttempted = recoveryAttempted;
  }
}

export class ResilientAuthClient {
  constructor({
    tokenManager,
    fetchImpl = globalThis.fetch,
    timeoutMs = 30_000,
    authHeader = "Authorization",
    authScheme = "Bearer",
    recoverStatuses = [401, 403],
    invalidateStatuses = [401],
  } = {}) {
    if (!tokenManager) {
      throw new Error("tokenManager is required");
    }
    if (typeof fetchImpl !== "function") {
      throw new Error("fetch implementation is required");
    }

    this.tokenManager = tokenManager;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = Math.max(
      1_000,
      Number(timeoutMs) || 30_000
    );
    this.authHeader = authHeader;
    this.authScheme = authScheme;
    this.recoverStatuses = new Set(
      recoverStatuses.map(Number)
    );
    this.invalidateStatuses = new Set(
      invalidateStatuses.map(Number)
    );
    this.metrics = {
      attempted: 0,
      recovered: 0,
      failed: 0,
      lastStatus: null,
      lastAt: null,
    };
  }

  recoveryStatus() {
    return { ...this.metrics };
  }

  async request(
    input,
    init = {},
    { auth = true, retryAuth = true } = {}
  ) {
    const attempt = async forceRefresh => {
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.timeoutMs
      );

      try {
        const headers = new Headers(
          init.headers || {}
        );

        if (auth) {
          const token =
            await this.tokenManager.getToken({
              forceRefresh,
            });
          headers.set(
            this.authHeader,
            this.authScheme
              ? this.authScheme + " " + token
              : token
          );
        }

        return await this.fetchImpl(input, {
          ...init,
          headers,
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    let response = await attempt(false);
    let recoveryAttempted = false;
    const firstStatus = response.status;

    if (
      auth &&
      retryAuth &&
      this.recoverStatuses.has(response.status) &&
      this.tokenManager.canRefresh
    ) {
      recoveryAttempted = true;
      this.metrics.attempted += 1;
      this.metrics.lastStatus = response.status;
      this.metrics.lastAt =
        new Date().toISOString();

      if (
        this.invalidateStatuses.has(
          response.status
        )
      ) {
        this.tokenManager.invalidate();
      }

      try {
        response = await attempt(true);
      } catch (error) {
        this.metrics.failed += 1;
        const wrapped = new AuthHttpError(
          "Authentication recovery failed after HTTP " +
            firstStatus,
          {
            status: firstStatus,
            code:
              error?.code ||
              "AUTH_RECOVERY_FAILED",
            recoveryAttempted: true,
          }
        );
        wrapped.cause = error;
        throw wrapped;
      }
    }

    if (!response.ok) {
      const body = await response
        .text()
        .catch(() => "");

      if (recoveryAttempted) {
        this.metrics.failed += 1;
      }

      throw new AuthHttpError(
        "HTTP " + response.status +
          (recoveryAttempted
            ? " after one auth recovery attempt"
            : ""),
        {
          status: response.status,
          body: body.slice(0, 1000),
          recoveryAttempted,
        }
      );
    }

    if (recoveryAttempted) {
      this.metrics.recovered += 1;
    }

    return response;
  }
}
