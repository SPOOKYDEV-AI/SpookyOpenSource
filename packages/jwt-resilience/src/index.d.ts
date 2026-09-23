export interface TokenEntry {
  token: string;
  expiresAt?: number | null;
  updatedAt?: number | null;
  source?: string;
}

export interface TokenStatus {
  configured: boolean;
  source: string;
  expiresAt: number | null;
  expiresInMs: number | null;
  updatedAt: number | null;
  effectiveSkewMs: number;
  expired: boolean;
  valid: boolean;
  refreshable: boolean;
}

export interface TokenStore {
  load(): TokenEntry | null;
  save(entry: TokenEntry): void;
  clear(): void;
}

export type RefreshResult = string | TokenEntry;

export class FileTokenStore implements TokenStore {
  constructor(options?: { file?: string });
  file: string;
  load(): TokenEntry | null;
  save(entry: TokenEntry): void;
  clear(): void;
}

export class JwtTokenManager {
  constructor(options?: {
    staticToken?: string;
    store?: TokenStore | null;
    refresh?: (() => Promise<RefreshResult>) | null;
    skewMs?: number;
    maxSkewFraction?: number;
    fallbackTtlMs?: number;
  });
  readonly canRefresh: boolean;
  refresh: (() => Promise<RefreshResult>) | null;
  status(): TokenStatus;
  getToken(options?: { forceRefresh?: boolean }): Promise<string>;
  invalidate(): void;
  adoptToken(
    result: RefreshResult,
    options?: { source?: string; persist?: boolean }
  ): string;
  reloadFromStore(): boolean;
}

export class AuthHttpError extends Error {
  constructor(message: string, options?: {
    status?: number | null;
    body?: string;
    code?: string | null;
    recoveryAttempted?: boolean;
  });
  status: number | null;
  body: string;
  code: string | null;
  recoveryAttempted: boolean;
}

export class ResilientAuthClient {
  constructor(options: {
    tokenManager: JwtTokenManager;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    authHeader?: string;
    authScheme?: string;
    recoverStatuses?: number[];
    invalidateStatuses?: number[];
  });
  recoveryStatus(): {
    attempted: number;
    recovered: number;
    failed: number;
    lastStatus: number | null;
    lastAt: string | null;
  };
  request(
    input: RequestInfo | URL,
    init?: RequestInit,
    options?: { auth?: boolean; retryAuth?: boolean }
  ): Promise<Response>;
}

export interface AuthSupervisorSnapshot {
  status: string;
  previousStatus: string | null;
  lastTransitionAt: string;
  lastCheckAt: string | null;
  lastRefreshAt: string | null;
  lastError: string | null;
  recoveryAttempts: number;
  recoverySuccesses: number;
  recoveryFailures: number;
  circuitUntil: number | null;
  auth: TokenStatus;
}

export class AuthSupervisor {
  constructor(options: {
    tokenManager: JwtTokenManager;
    intervalMs?: number;
    refreshBeforeMs?: number;
    recoveryCooldownMs?: number;
    maxRecoveriesPerWindow?: number;
    recoveryWindowMs?: number;
    circuitOpenMs?: number;
    authRequiredCodes?: string[];
    onTransition?: ((event: {
      previous: string | null;
      next: string;
      detail: string;
      snapshot: AuthSupervisorSnapshot;
    }) => void | Promise<void>) | null;
  });
  start(): void;
  stop(): void;
  tick(): Promise<boolean>;
  recover(reason?: string): Promise<boolean>;
  snapshot(): AuthSupervisorSnapshot;
}

export interface ReadinessReason {
  code: string;
  message: string;
}

export function evaluateAuthReadiness(options?: {
  auth?: Partial<TokenStatus>;
  checks?: Array<{
    ready?: boolean;
    code?: string;
    message?: string;
    name?: string;
  }>;
}): { ready: boolean; reasons: ReadinessReason[] };

export interface AuthRecoverySnapshot {
  status: string;
  attempts: number;
  successes: number;
  failures: number;
  lastReason: string | null;
  lastError: string | null;
  lastAt: string | null;
  auth: TokenStatus;
}

export class AuthRecoveryController {
  constructor(options: {
    tokenManager: JwtTokenManager;
    fallbackRefresh?: ((context: {
      reason: string;
      primaryError: unknown;
    }) => Promise<RefreshResult | void>) | null;
    verify?: ((context: {
      auth: TokenStatus;
      tokenManager: JwtTokenManager;
    }) => boolean | { ready?: boolean } | Promise<boolean | { ready?: boolean }>) | null;
    timeoutMs?: number;
    authRequiredCodes?: string[];
    onState?: ((snapshot: AuthRecoverySnapshot) => void | Promise<void>) | null;
  });
  snapshot(): AuthRecoverySnapshot;
  recover(options?: {
    reason?: string;
    force?: boolean;
  }): Promise<{
    ok: boolean;
    path: "direct-refresh" | "fallback-refresh" | "failed";
    auth: TokenStatus;
    error?: unknown;
  }>;
}

export function parseJwtExpiryMs(token: string): number;

export const AUTH_ERROR_CODES: Readonly<{
  AUTH_REQUIRED: "AUTH_REQUIRED";
  AUTH_REFRESH_INVALID: "AUTH_REFRESH_INVALID";
  AUTH_TOKEN_INVALID: "AUTH_TOKEN_INVALID";
  AUTH_RECOVERY_FAILED: "AUTH_RECOVERY_FAILED";
  AUTH_RECOVERY_TIMEOUT: "AUTH_RECOVERY_TIMEOUT";
  AUTH_FALLBACK_TOKEN_MISSING: "AUTH_FALLBACK_TOKEN_MISSING";
  WORKER_UNAVAILABLE: "WORKER_UNAVAILABLE";
  WORKER_LAUNCH_FAILED: "WORKER_LAUNCH_FAILED";
  WORKER_TOKEN_MISSING: "WORKER_TOKEN_MISSING";
  WORKER_FAILED: "WORKER_FAILED";
  WORKER_TIMEOUT: "WORKER_TIMEOUT";
}>;

export { createWindowsTaskRefresher } from "./windows-task-refresh.js";
