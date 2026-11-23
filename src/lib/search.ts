import { SEARCH_COST_PER_CALL } from "./config";
import { addSearchUsage, type Ctx } from "./ctx";
import { mockSearch } from "./fixtures";

export interface SearchHit {
  url: string;
  title: string;
  publishedDate?: string;
  text: string;
}

export interface SearchQuery {
  query: string;
  kind: "auto" | "news" | "people" | "company";
  num?: number;
  sinceDays?: number;
  maxChars?: number;
  lane?: string; // used for logging and mock routing
}

export interface SearchResult {
  hits: SearchHit[];
  provider: string;
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs = 25_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const txt = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${txt.slice(0, 200)}`);
    return JSON.parse(txt);
  } finally {
    clearTimeout(t);
  }
}

async function exa(q: SearchQuery): Promise<SearchHit[]> {
  const body: Record<string, unknown> = {
    query: q.query,
    type: "auto",
    numResults: q.num ?? 6,
    contents: { text: { maxCharacters: q.maxChars ?? 3000 } },
  };
  if (q.kind === "news") body.category = "news";
  if (q.kind === "people") body.category = "people";
  if (q.kind === "company") body.category = "company";
  // date filters are not used with people/company categories
  if (q.sinceDays && (q.kind === "news" || q.kind === "auto"))
    body.startPublishedDate = new Date(Date.now() - q.sinceDays * 864e5).toISOString();
  const j = await post("https://api.exa.ai/search", { "x-api-key": process.env.EXA_API_KEY! }, body);
  return (j.results || []).map((r: { url: string; title?: string; publishedDate?: string; text?: string; highlights?: string[] }) => ({
    url: r.url,
    title: r.title || r.url,
    publishedDate: r.publishedDate,
    text: (r.text || (r.highlights || []).join(" … ") || "").slice(0, q.maxChars ?? 3000),
  }));
}

async function tavily(q: SearchQuery): Promise<SearchHit[]> {
  const body: Record<string, unknown> = {
    query: q.query,
    topic: q.kind === "news" ? "news" : "general",
    max_results: q.num ?? 6,
    search_depth: "advanced",
  };
  if (q.sinceDays && q.kind === "news") body.days = q.sinceDays;
  const j = await post(
    "https://api.tavily.com/search",
    { authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
    { ...body, api_key: process.env.TAVILY_API_KEY },
  );
  return (j.results || []).map((r: { url: string; title?: string; published_date?: string; content?: string }) => ({
    url: r.url,
    title: r.title || r.url,
    publishedDate: r.published_date,
    text: (r.content || "").slice(0, q.maxChars ?? 3000),
  }));
}

/** Exa first; Tavily as fallback when Exa errors or returns nothing. */
export async function search(ctx: Ctx, q: SearchQuery): Promise<SearchResult> {
  if (ctx.mock) {
    addSearchUsage(ctx, 0);
    await new Promise((r) => setTimeout(r, 120 + Math.random() * 300));
    return { hits: mockSearch(q), provider: "mock" };
  }
  const errors: string[] = [];
  if (process.env.EXA_API_KEY) {
    try {
      addSearchUsage(ctx, SEARCH_COST_PER_CALL);
      const hits = await exa(q);
      if (hits.length) return { hits, provider: "exa" };
    } catch (e) {
      errors.push(`exa: ${String(e).slice(0, 120)}`);
    }
  }
  if (process.env.TAVILY_API_KEY && q.kind !== "people") {
    try {
      addSearchUsage(ctx, SEARCH_COST_PER_CALL);
      const hits = await tavily(q);
      return { hits, provider: "tavily" };
    } catch (e) {
      errors.push(`tavily: ${String(e).slice(0, 120)}`);
    }
  }
  if (errors.length) throw new Error(errors.join(" | "));
  return { hits: [], provider: process.env.EXA_API_KEY ? "exa" : "none" };
}

/** Fetch page text for a URL (used to build a seller profile from a website). */
export async function fetchPage(ctx: Ctx, url: string): Promise<string> {
  if (ctx.mock) return "";
  if (process.env.EXA_API_KEY) {
    addSearchUsage(ctx, SEARCH_COST_PER_CALL);
    const j = await post("https://api.exa.ai/contents", { "x-api-key": process.env.EXA_API_KEY }, { urls: [url], text: { maxCharacters: 8000 } });
    return j.results?.[0]?.text || "";
  }
  const res = await fetch(url);
  const html = await res.text();
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").slice(0, 8000);
}
