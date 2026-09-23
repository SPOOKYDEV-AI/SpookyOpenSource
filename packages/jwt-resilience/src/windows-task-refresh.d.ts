import type { RefreshResult } from "./index.js";

export function createWindowsTaskRefresher(options: {
  taskName: string;
  stateFile: string;
  readToken: () => RefreshResult | null | Promise<RefreshResult | null>;
  timeoutMs?: number;
  pollMs?: number;
}): () => Promise<RefreshResult>;
