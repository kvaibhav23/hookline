import { z } from "zod";
import { llmProvider, models, priceFor } from "./config";
import { addLlmUsage, type Ctx } from "./ctx";

// Provider-agnostic structured-output helper.
// Every call returns JSON validated with zod; on a bad response we retry once with the error.

interface Raw {
  text: string;
  inTok: number;
  outTok: number;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 90_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 300)}`);
    return JSON.parse(text);
  } finally {
    clearTimeout(t);
  }
}

async function callProvider(model: string, system: string, user: string, maxTokens: number): Promise<Raw> {
  const p = llmProvider();
  if (p === "anthropic") {
    const j = await postJson(
      "https://api.anthropic.com/v1/messages",
      { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
      { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
    );
    const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
    return { text, inTok: j.usage?.input_tokens ?? 0, outTok: j.usage?.output_tokens ?? 0 };
  }
  if (p === "openai") {
    const j = await postJson(
      "https://api.openai.com/v1/chat/completions",
      { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      {
        model,
        response_format: { type: "json_object" },
        max_completion_tokens: maxTokens * 4, // reasoning models spend tokens thinking
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      },
    );
    return { text: j.choices?.[0]?.message?.content ?? "", inTok: j.usage?.prompt_tokens ?? 0, outTok: j.usage?.completion_tokens ?? 0 };
  }
  if (p === "gemini") {
    const j = await postJson(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { "x-goog-api-key": process.env.GEMINI_API_KEY! },
      {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", maxOutputTokens: maxTokens * 4 },
      },
    );
    const text = (j.candidates?.[0]?.content?.parts || []).map((x: { text?: string }) => x.text || "").join("");
    return { text, inTok: j.usageMetadata?.promptTokenCount ?? 0, outTok: j.usageMetadata?.candidatesTokenCount ?? 0 };
  }
  throw new Error("No LLM provider configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY or GEMINI_API_KEY.");
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const start = cleaned.search(/[[{]/);
  if (start < 0) throw new Error("no JSON in response");
  const open = cleaned[start];
  const close = open === "{" ? "}" : "]";
  const end = cleaned.lastIndexOf(close);
  return JSON.parse(cleaned.slice(start, end + 1));
}

export interface LlmJsonOpts<T> {
  task: string;
  tier: "fast" | "smart";
  system: string;
  user: string;
  schema: z.ZodType<T>;
  shape: string; // human-readable description of the JSON to return
  maxTokens?: number;
  /** Deterministic stand-in used only in mock mode (dev/tests). */
  mock: () => T;
}

export async function llmJson<T>(ctx: Ctx, o: LlmJsonOpts<T>): Promise<T> {
  if (ctx.mock) {
    addLlmUsage(ctx, 0, 0, 0);
    await new Promise((r) => setTimeout(r, 150 + Math.random() * 250)); // make the live view watchable
    return o.schema.parse(o.mock());
  }
  const model = models()[o.tier];
  const [pin, pout] = priceFor(model);
  const system = `${o.system}\n\nReturn ONLY valid JSON, no prose, matching this shape:\n${o.shape}`;
  let user = o.user;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw: Raw;
    try {
      raw = await callProvider(model, system, user, o.maxTokens ?? 1500);
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1200));
      continue; // network / 5xx: one retry
    }
    addLlmUsage(ctx, raw.inTok, raw.outTok, (raw.inTok * pin + raw.outTok * pout) / 1e6);
    try {
      return o.schema.parse(extractJson(raw.text));
    } catch (e) {
      lastErr = e;
      user = `${o.user}\n\nYour previous answer was invalid (${String(e).slice(0, 300)}). Return corrected JSON only.`;
    }
  }
  throw new Error(`LLM task "${o.task}" failed: ${String(lastErr).slice(0, 300)}`);
}
