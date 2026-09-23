export interface ReadinessReason {
  code: string;
  message: string;
  service?: string | null;
}

export interface ReadinessResult {
  ready: boolean;
  reasons: ReadinessReason[];
}

export class AtomicJsonStateStore {
  constructor(options: { file: string });
  file: string;
  read(): any;
  write(value: any): void;
  clear(): void;
}

export class RestartBudget {
  constructor(options?: {
    maxRestarts?: number;
    windowMs?: number;
    circuitOpenMs?: number;
  });
  canRestart(now?: number): boolean;
  record(now?: number): boolean;
  reset(): void;
  snapshot(now?: number): {
    attemptsInWindow: number;
    maxRestarts: number;
    windowMs: number;
    circuitOpenMs: number;
    circuitUntil: number | null;
    open: boolean;
  };
}

export function evaluateServiceReadiness(options?: {
  processAlive?: boolean;
  expectedPid?: number | null;
  expectedBootId?: string | null;
  probe?: {
    ready?: boolean;
    pid?: number | null;
    bootId?: string | null;
    message?: string;
    reasons?: ReadinessReason[];
  } | null;
}): ReadinessResult;

export function aggregateReadiness(
  results?: Array<ReadinessResult & { service?: string }>
): ReadinessResult;

export function pidAlive(pid: number): boolean;
export function sleep(ms: number): Promise<void>;
export function waitForProcessExit(
  childOrPid: number | { pid?: number },
  timeoutMs?: number
): Promise<boolean>;

export function spawnManagedProcess(options: {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio?: any;
  windowsHide?: boolean;
}): any;

export function drainProcess(
  child: any,
  options?: {
    gracefulSignal?: NodeJS.Signals;
    gracefulTimeoutMs?: number;
    forceSignal?: NodeJS.Signals;
    forceTimeoutMs?: number;
    terminate?: ((context: {
      child: any;
      pid: number;
      force: boolean;
    }) => void | Promise<void>) | null;
  }
): Promise<{
  drained: boolean;
  escalated: boolean;
  pid: number | null;
}>;

export function drainServices(
  records: Array<{
    name?: string;
    child?: any;
    drainOptions?: Record<string, any>;
  }>,
  options?: Record<string, any>
): Promise<{
  drained: boolean;
  results: Array<{
    name: string | null;
    drained: boolean;
    escalated: boolean;
    pid: number | null;
  }>;
}>;

export interface ServiceConfig {
  name: string;
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  stdio?: any;
  windowsHide?: boolean;
  restart?: {
    maxRestarts?: number;
    windowMs?: number;
    circuitOpenMs?: number;
  };
  drain?: Record<string, any>;
  readinessTimeoutMs?: number;
  readiness?: ((context: {
    child: any;
    bootId: string;
    service: ServiceConfig;
    supervisor: ServiceSupervisor;
  }) => Promise<{
    ready: boolean;
    pid?: number;
    bootId?: string;
    reasons?: ReadinessReason[];
    message?: string;
  }> | {
    ready: boolean;
    pid?: number;
    bootId?: string;
    reasons?: ReadinessReason[];
    message?: string;
  }) | null;
}

export class ServiceSupervisor {
  constructor(options: {
    services: ServiceConfig[];
    stateFile?: string | AtomicJsonStateStore;
    intervalMs?: number;
    readinessTimeoutMs?: number;
    readinessPollMs?: number;
    restart?: {
      maxRestarts?: number;
      windowMs?: number;
      circuitOpenMs?: number;
    };
    backoff?: ((attempt: number, context: {
      service: string;
      reason: string;
    }) => number) | null;
    spawnProcess?: Function;
    onState?: ((state: any) => void) | null;
    onLog?: ((entry: any) => void) | null;
  });
  readonly bootId: string;
  snapshot(): any;
  start(options?: { requireReady?: boolean }): Promise<any>;
  stop(): Promise<any>;
  probeService(name: string): Promise<any>;
  probeAll(): Promise<any>;
  waitUntilReady(options?: { timeoutMs?: number }): Promise<any>;
  recover(name: string, reason?: string): Promise<any>;
}

export function waitForGenerationReady(options: {
  readState: () => any | Promise<any>;
  previousBootId?: string | null;
  startedAfter?: string | Date | null;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{ ready: boolean; state: any }>;

export function safeRestart(options: {
  readState: () => any | Promise<any>;
  stop: (context: any) => any | Promise<any>;
  start: (context: any) => any | Promise<any>;
  waitReady?: ((context: any) => any | Promise<any>) | null;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{
  ready: true;
  previousBootId: string | null;
  bootId: string | null;
  requestId: string;
  state: any;
}>;
