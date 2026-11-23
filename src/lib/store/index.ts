import type { Run, RunEvent, SellerProfile } from "../types";
export { STALE_MS } from "../types";
import { FileStore } from "./file";
import { PgStore } from "./pg";

export interface Store {
  createRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  saveRun(run: Run): Promise<void>;
  /**
   * Atomically take ownership of a run. Wins if the run is queued, or if it is "running" but no
   * worker has checkpointed it for STALE_MS (its worker was killed). Returns what it was claimed from.
   */
  claimRun(id: string): Promise<Claim>;
  listRuns(limit?: number): Promise<Run[]>;
  appendEvent(runId: string, ev: Omit<RunEvent, "seq">): Promise<RunEvent>;
  getEvents(runId: string, afterSeq?: number): Promise<RunEvent[]>;
  listSellers(): Promise<SellerProfile[]>;
  saveSeller(s: SellerProfile): Promise<void>;
}

export type Claim = false | "queued" | "stale";

const g = globalThis as unknown as { __hlStore?: Store };

export function getStore(): Store {
  if (g.__hlStore) return g.__hlStore;
  g.__hlStore = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  return g.__hlStore;
}
