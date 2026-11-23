import type { Run, RunEvent, StageId } from "./types";

/** Per-run execution context passed to every stage, LLM call and search call. */
export interface Ctx {
  run: Run;
  mock: boolean;
  emit: (stage: StageId, status: RunEvent["status"], message: string, ms?: number) => Promise<void>;
}

export function addLlmUsage(ctx: Ctx, inTok: number, outTok: number, cost: number) {
  const m = ctx.run.metrics;
  m.llmCalls += 1;
  m.inputTokens += inTok;
  m.outputTokens += outTok;
  m.costUsd += cost;
}

export function addSearchUsage(ctx: Ctx, cost: number) {
  ctx.run.metrics.searchCalls += 1;
  ctx.run.metrics.searchCostUsd += cost;
}
