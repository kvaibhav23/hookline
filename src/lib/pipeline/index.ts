import { randomUUID } from "crypto";
import { isMock } from "../config";
import type { Ctx } from "../ctx";
import { getSeller } from "../sellers";
import { getStore } from "../store";
import { STAGES, type Run, type RunEvent, type RunInput, type StageId } from "../types";
import { stageExtract, stageFreshness, stageGather, stageIdentity } from "./research";
import { stageDraft, stageGate, stageHooks, stageVerify } from "./write";

type Outcome = "next" | "pause" | "hold";

const FNS: Record<StageId, (ctx: Ctx) => Promise<Outcome>> = {
  intake: async (ctx) => {
    const { input, seller } = ctx.run;
    await ctx.emit("intake", "info", `Prospect: ${input.name} at ${input.company}${input.title ? ` (${input.title})` : ""}. Selling: ${seller.name}.`);
    return "next";
  },
  identity: stageIdentity,
  freshness: stageFreshness,
  gather: stageGather,
  extract: stageExtract,
  gate: stageGate,
  hooks: stageHooks,
  draft: stageDraft,
  verify: stageVerify,
  finalize: async (ctx) => {
    await ctx.emit("finalize", "info", `Draft queued for human review — confidence ${ctx.run.state.confidence}. Nothing has been sent.`);
    return "next";
  },
};

const ORDER = STAGES.map((s) => s.id) as StageId[];

export async function createRun(input: RunInput): Promise<Run> {
  const seller = await getSeller(input.sellerId);
  const now = new Date().toISOString();
  const run: Run = {
    id: randomUUID().slice(0, 8),
    createdAt: now,
    updatedAt: now,
    status: "queued",
    input: { ...input, name: input.name.trim(), company: input.company.trim() },
    seller,
    state: { nextStage: "intake", target: { name: input.name.trim(), company: input.company.trim(), title: input.title?.trim() || undefined }, sources: [], laneStats: [], signals: [] },
    branches: [],
    metrics: { llmCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, searchCalls: 0, searchCostUsd: 0 },
    mock: isMock(),
  };
  await getStore().createRun(run);
  return run;
}

/**
 * Execute a claimed run from state.nextStage until it finishes, pauses or holds.
 * Every stage boundary is persisted, so a paused run resumes exactly where it stopped.
 */
export async function executeRun(runId: string, onEvent?: (e: RunEvent) => void): Promise<Run> {
  const store = getStore();
  const run = (await store.getRun(runId))!;
  run.status = "running";
  run.metrics.startedAt ||= new Date().toISOString();
  const t0 = Date.now();

  const ctx: Ctx = {
    run,
    mock: run.mock,
    emit: async (stage, status, message, ms) => {
      const ev = await store.appendEvent(run.id, { ts: new Date().toISOString(), stage, status, message, ms });
      onEvent?.(ev);
    },
  };

  try {
    let i = ORDER.indexOf(run.state.nextStage);
    while (i < ORDER.length) {
      const stage = ORDER[i];
      run.state.nextStage = stage;
      const label = STAGES[i].label;
      await ctx.emit(stage, "start", label);
      const s0 = Date.now();
      const outcome = await FNS[stage](ctx);
      const ms = Date.now() - s0;

      if (outcome === "pause") {
        run.status = "paused";
        run.state.nextStage = "freshness";
        if (!run.branches.includes("pause")) run.branches.push("pause");
        await ctx.emit(stage, "pause", run.state.identity?.note || "Waiting for rep", ms);
        break;
      }
      if (outcome === "hold") {
        run.status = "hold";
        await ctx.emit(stage, "hold", `HOLD — ${run.state.gate?.reasons[0]}${run.state.gate?.revisitOn ? ` Revisit on ${run.state.gate.revisitOn}.` : ""}`, ms);
        break;
      }
      await ctx.emit(stage, "done", label, ms);
      i++;
      run.state.nextStage = ORDER[Math.min(i, ORDER.length - 1)];
      await store.saveRun(run);
    }
    if (run.status === "running") run.status = "awaiting_review";
  } catch (e) {
    run.status = "failed";
    run.error = String(e instanceof Error ? e.message : e).slice(0, 500);
    await ctx.emit(run.state.nextStage, "error", `Failed: ${run.error}`);
  }
  run.metrics.ms = (run.metrics.ms || 0) + (Date.now() - t0);
  run.metrics.finishedAt = new Date().toISOString();
  await store.saveRun(run);
  return run;
}

/** Rep resolves an ambiguous identity. index = -1 means "none of these". */
export async function resumeRun(runId: string, index: number): Promise<Run | null> {
  const store = getStore();
  const run = await store.getRun(runId);
  if (!run || run.status !== "paused" || !run.state.identity) return null;
  const c = run.state.identity.candidates[index];
  if (c) {
    run.state.identity = { ...run.state.identity, chosen: c, mode: "rep", note: `Rep confirmed: ${c.name} — ${c.title || ""}` };
    run.state.target = { name: c.name, company: run.input.company, title: c.title || run.input.title };
  } else {
    run.state.identity = { ...run.state.identity, chosen: undefined, mode: "not_found", note: "Rep said none of the matches is right — continuing with company-level research." };
  }
  run.state.nextStage = "freshness";
  run.status = "queued";
  await store.saveRun(run);
  await store.appendEvent(run.id, { ts: new Date().toISOString(), stage: "identity", status: "info", message: run.state.identity.note });
  return run;
}
