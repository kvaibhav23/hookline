// Central config. Everything is env-driven so the same code runs locally and on Vercel.

export type LlmProvider = "anthropic" | "openai" | "gemini";

const DEFAULT_MODELS: Record<LlmProvider, { fast: string; smart: string }> = {
  anthropic: { fast: "claude-haiku-5-5", smart: "claude-sonnet-5-5" },
  openai: { fast: "gpt-5-mini", smart: "gpt-5" },
  gemini: { fast: "gemini-2.5-flash", smart: "gemini-2.5-pro" },
};

export function llmProvider(): LlmProvider | null {
  const forced = process.env.LLM_PROVIDER as LlmProvider | undefined;
  if (forced) return forced;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return null;
}

export function models() {
  const p = llmProvider() ?? "anthropic";
  return {
    fast: process.env.LLM_MODEL_FAST || DEFAULT_MODELS[p].fast,
    smart: process.env.LLM_MODEL_SMART || DEFAULT_MODELS[p].smart,
  };
}

/**
 * Mock mode = deterministic fake LLM + fixture search results.
 * Only for development and automated tests. The UI shows a MOCK badge on every such run.
 */
export function isMock(): boolean {
  if (process.env.MOCK_MODE === "1") return true;
  if (process.env.MOCK_MODE === "0") return false;
  return !llmProvider() || !(process.env.EXA_API_KEY || process.env.TAVILY_API_KEY);
}

export function health() {
  return {
    llm: llmProvider(),
    models: models(),
    exa: !!process.env.EXA_API_KEY,
    tavily: !!process.env.TAVILY_API_KEY,
    db: process.env.DATABASE_URL ? "postgres" : "file",
    mock: isMock(),
  };
}

// Rough public list prices in USD per million tokens, used only for the cost estimate on the dashboard.
// Override with LLM_PRICE_IN / LLM_PRICE_OUT (per million tokens) if your model differs.
const PRICES: [RegExp, number, number][] = [
  [/haiku/i, 1, 5],
  [/sonnet/i, 3, 15],
  [/opus/i, 15, 75],
  [/gpt-5-mini|gpt-4\.1-mini|4o-mini/i, 0.25, 2],
  [/gpt-5|gpt-4\.1|gpt-4o/i, 1.25, 10],
  [/flash/i, 0.3, 2.5],
  [/gemini.*pro/i, 1.25, 10],
];

export function priceFor(model: string): [number, number] {
  if (process.env.LLM_PRICE_IN && process.env.LLM_PRICE_OUT)
    return [Number(process.env.LLM_PRICE_IN), Number(process.env.LLM_PRICE_OUT)];
  for (const [re, i, o] of PRICES) if (re.test(model)) return [i, o];
  return [1, 5];
}

export const SEARCH_COST_PER_CALL = Number(process.env.SEARCH_COST_PER_CALL || 0.007);
