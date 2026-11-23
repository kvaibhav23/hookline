import type { Run, RunEvent, SellerProfile } from "../types";
import { FileStore } from "./file";
import { PgStore } from "./pg";

export interface Store {
  createRun(run: Run): Promise<void>;
  getRun(id: string): Promise<Run | null>;
  saveRun(run: Run): Promise<void>;
  /** Atomically move queued -> running. Returns true if this caller won. */
  claimRun(id: string): Promise<boolean>;
  listRuns(limit?: number): Promise<Run[]>;
  appendEvent(runId: string, ev: Omit<RunEvent, "seq">): Promise<RunEvent>;
  getEvents(runId: string, afterSeq?: number): Promise<RunEvent[]>;
  listSellers(): Promise<SellerProfile[]>;
  saveSeller(s: SellerProfile): Promise<void>;
}

const g = globalThis as unknown as { __hlStore?: Store };

export function getStore(): Store {
  if (g.__hlStore) return g.__hlStore;
  g.__hlStore = process.env.DATABASE_URL ? new PgStore(process.env.DATABASE_URL) : new FileStore();
  return g.__hlStore;
}

export function storeKind(): "postgres" | "file" {
  return process.env.DATABASE_URL ? "postgres" : "file";
}
