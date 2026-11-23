import { promises as fs } from "fs";
import path from "path";
import type { Run, RunEvent, SellerProfile } from "../types";
import { STALE_MS, type Claim, type Store } from "./index";

// Local JSON-file store. Good for running on your laptop with zero setup.
// On Vercel, set DATABASE_URL (Postgres) instead — /tmp is wiped between invocations.

interface DB {
  runs: Record<string, Run>;
  events: Record<string, RunEvent[]>;
  sellers: Record<string, SellerProfile>;
}

const DIR = process.env.VERCEL ? "/tmp/hookline" : path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "db.json");

// Route bundles can each get their own module instance, so keep state on globalThis.
const g = globalThis as unknown as { __hlFile?: { cache: DB | null; chain: Promise<unknown> } };
const S = (g.__hlFile ||= { cache: null, chain: Promise.resolve() });

async function load(): Promise<DB> {
  if (S.cache) return S.cache;
  try {
    S.cache = JSON.parse(await fs.readFile(FILE, "utf8")) as DB;
  } catch {
    S.cache = { runs: {}, events: {}, sellers: {} };
  }
  return S.cache;
}

async function persist() {
  await fs.mkdir(DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(S.cache));
  await fs.rename(tmp, FILE);
}

/** Serialise all mutations so concurrent runs don't clobber the file. */
function locked<T>(fn: (db: DB) => Promise<T> | T): Promise<T> {
  const p = S.chain.then(async () => {
    const db = await load();
    const r = await fn(db);
    await persist();
    return r;
  });
  S.chain = p.catch(() => undefined);
  return p;
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

export class FileStore implements Store {
  async createRun(run: Run) {
    await locked((db) => {
      db.runs[run.id] = clone(run);
      db.events[run.id] = [];
    });
  }
  async getRun(id: string) {
    const db = await load();
    return db.runs[id] ? clone(db.runs[id]) : null;
  }
  async saveRun(run: Run) {
    await locked((db) => {
      db.runs[run.id] = clone({ ...run, updatedAt: new Date().toISOString() });
    });
  }
  async claimRun(id: string): Promise<Claim> {
    return locked((db) => {
      const r = db.runs[id];
      if (!r) return false;
      const stale = r.status === "running" && Date.now() - Date.parse(r.updatedAt) > STALE_MS;
      if (r.status !== "queued" && !stale) return false;
      r.status = "running";
      r.updatedAt = new Date().toISOString();
      return stale ? "stale" : "queued";
    });
  }
  async listRuns(limit = 500) {
    const db = await load();
    return Object.values(db.runs)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map(clone);
  }
  async appendEvent(runId: string, ev: Omit<RunEvent, "seq">) {
    return locked((db) => {
      const list = (db.events[runId] ||= []);
      const full: RunEvent = { ...ev, seq: list.length + 1 };
      list.push(full);
      return full;
    });
  }
  async getEvents(runId: string, afterSeq = 0) {
    const db = await load();
    return (db.events[runId] || []).filter((e) => e.seq > afterSeq).map(clone);
  }
  async listSellers() {
    const db = await load();
    return Object.values(db.sellers).map(clone);
  }
  async saveSeller(s: SellerProfile) {
    await locked((db) => {
      db.sellers[s.id] = clone(s);
    });
  }
}
