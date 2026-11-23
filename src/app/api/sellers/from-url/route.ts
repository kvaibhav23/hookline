import { z } from "zod";
import { isMock } from "@/lib/config";
import type { Ctx } from "@/lib/ctx";
import { llmJson } from "@/lib/llm";
import { fetchPage } from "@/lib/search";
import type { Run, SellerProfile } from "@/lib/types";

export const maxDuration = 60;

const Schema = z.object({
  name: z.string(),
  oneLiner: z.string(),
  valueProps: z.array(z.object({ title: z.string(), description: z.string() })).min(1).max(5),
  proofPoints: z.array(z.string()).max(4),
  targetPersonas: z.array(z.string()).max(8),
});

// Build a seller profile from the seller's own website, so hooks connect to what they actually sell.
export async function POST(req: Request) {
  const { url } = await req.json();
  if (!url) return Response.json({ error: "url required" }, { status: 400 });
  if (isMock()) return Response.json({ error: "Add API keys to generate a profile from a website (mock mode)." }, { status: 400 });
  const ctx = { run: { metrics: { llmCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, searchCalls: 0, searchCostUsd: 0 } } as unknown as Run, mock: false, emit: async () => {} } as Ctx;
  const text = await fetchPage(ctx, url);
  if (!text) return Response.json({ error: "Could not read that page" }, { status: 400 });
  const p = await llmJson(ctx, {
    task: "seller",
    tier: "fast",
    system: "Extract a concise B2B seller profile from this company's website. Value props must be concrete outcomes, not slogans. Proof points only if the page states them (customers, numbers); otherwise return an empty list.",
    user: `${url}\n\n${text.slice(0, 7000)}`,
    shape: `{"name":"","oneLiner":"","valueProps":[{"title":"","description":""}],"proofPoints":[""],"targetPersonas":[""]}`,
    schema: Schema,
    mock: () => ({ name: "", oneLiner: "", valueProps: [{ title: "", description: "" }], proofPoints: [], targetPersonas: [] }),
  });
  const seller: SellerProfile = {
    id: "s-" + Math.random().toString(36).slice(2, 8),
    name: p.name,
    website: url,
    oneLiner: p.oneLiner,
    valueProps: p.valueProps.map((v, i) => ({ id: `V${i + 1}`, ...v })),
    proofPoints: p.proofPoints.map((t, i) => ({ id: `P${i + 1}`, text: t })),
    targetPersonas: p.targetPersonas,
    competitors: [],
    customers: [],
    senderName: "Vaibhav",
    senderTitle: p.name,
    cta: "Worth a 20-minute call next week?",
    tone: "Warm, concise, plain-spoken. No hype.",
  };
  return Response.json({ seller });
}
