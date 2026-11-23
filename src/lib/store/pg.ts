import postgres from "postgres";
import type { Run, RunEvent, SellerProfile } from "../types";
import { STALE_MS, type Claim, type Store } from "./index";

// Postgres store (Neon / Supabase / Vercel Postgres). Tables are created on first use.

export class PgStore implements Store {
  private sql: postgres.Sql;
  private ready: Promise<void> | null = null;

  constructor(url: string) {
    this.sql = postgres(url, { max: 5, ssl: url.includes("localhost") ? false : "require", prepare: false });
  }

  private init() {
    if (!this.ready) {
      this.ready = (async () => {
        await this.sql`create table if not exists hl_runs (
          id text primary key, created_at timestamptz not null, updated_at timestamptz not null,
          status text not null, data jsonb not null)`;
        await this.sql`create table if not exists hl_events (
          run_id text not null, seq int not null, data jsonb not null, primary key (run_id, seq))`;
        await this.sql`create table if not exists hl_sellers (id text primary key, data jsonb not null)`;
      })();
    }
    return this.ready;
  }

  async createRun(run: Run) {
    await this.init();
    await this.sql`insert into hl_runs (id, created_at, updated_at, status, data)
      values (${run.id}, ${run.createdAt}, ${run.updatedAt}, ${run.status}, ${this.sql.json(run as never)})`;
  }
  async getRun(id: string) {
    await this.init();
    const rows = await this.sql`select data from hl_runs where id = ${id}`;
    return rows[0] ? (rows[0].data as Run) : null;
  }
  async saveRun(run: Run) {
    await this.init();
    const now = new Date().toISOString();
    const r = { ...run, updatedAt: now };
    await this.sql`update hl_runs set status = ${r.status}, updated_at = ${now}, data = ${this.sql.json(r as never)} where id = ${r.id}`;
  }
  async claimRun(id: string): Promise<Claim> {
    await this.init();
    const staleSecs = STALE_MS / 1000;
    const rows = await this.sql`
      update hl_runs r set status = 'running', updated_at = now(), data = jsonb_set(r.data, '{status}', '"running"')
      from (select id, status as prev from hl_runs where id = ${id} for update) p
      where r.id = p.id
        and (p.prev = 'queued' or (p.prev = 'running' and r.updated_at < now() - make_interval(secs => ${staleSecs})))
      returning p.prev`;
    if (!rows.length) return false;
    return rows[0].prev === "queued" ? "queued" : "stale";
  }
  async listRuns(limit = 500) {
    await this.init();
    const rows = await this.sql`select data from hl_runs order by created_at desc limit ${limit}`;
    return rows.map((r) => r.data as Run);
  }
  async appendEvent(runId: string, ev: Omit<RunEvent, "seq">) {
    await this.init();
    // retry on the (rare) seq collision
    for (let i = 0; i < 5; i++) {
      const [{ n }] = await this.sql`select coalesce(max(seq), 0) + 1 as n from hl_events where run_id = ${runId}`;
      const full: RunEvent = { ...ev, seq: Number(n) };
      try {
        await this.sql`insert into hl_events (run_id, seq, data) values (${runId}, ${full.seq}, ${this.sql.json(full as never)})`;
        return full;
      } catch {
        /* collision, retry */
      }
    }
    throw new Error("could not append event");
  }
  async getEvents(runId: string, afterSeq = 0) {
    await this.init();
    const rows = await this.sql`select data from hl_events where run_id = ${runId} and seq > ${afterSeq} order by seq`;
    return rows.map((r) => r.data as RunEvent);
  }
  async listSellers() {
    await this.init();
    const rows = await this.sql`select data from hl_sellers`;
    return rows.map((r) => r.data as SellerProfile);
  }
  async saveSeller(s: SellerProfile) {
    await this.init();
    await this.sql`insert into hl_sellers (id, data) values (${s.id}, ${this.sql.json(s as never)})
      on conflict (id) do update set data = excluded.data`;
  }
}
