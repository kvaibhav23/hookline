import { z } from "zod";
import type { Ctx } from "../ctx";
import { llmJson } from "../llm";
import { search, type SearchHit } from "../search";
import type { Candidate, Lane, Signal, SignalType, Source } from "../types";
import { firstSentence, functionHint, parseTitleLine, quoteInSource, scoreSignal } from "./util";

// ───────────────────────── Identity ─────────────────────────

const CandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      index: z.number(),
      name: z.string(),
      title: z.string().optional().nullable(),
      company: z.string().optional().nullable(),
      location: z.string().optional().nullable(),
      matchScore: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
});

export async function stageIdentity(ctx: Ctx): Promise<"next" | "pause"> {
  const { input, state } = { input: ctx.run.input, state: ctx.run.state };
  if (input.linkedinUrl) {
    state.identity = {
      mode: "given",
      candidates: [],
      chosen: { name: input.name, company: input.company, title: input.title, url: input.linkedinUrl, matchScore: 0.95, reason: "Profile URL provided by the rep" },
      note: "Rep supplied the profile URL — identity taken as given.",
    };
    await ctx.emit("identity", "info", "Profile URL supplied by rep — skipping disambiguation.");
    return "next";
  }

  const q = [input.name, input.company, input.title].filter(Boolean).join(" ");
  let hits: SearchHit[] = [];
  let provider = "none";
  try {
    ({ hits, provider } = await search(ctx, { query: q, kind: "people", num: 6, lane: "identity", maxChars: 800 }));
  } catch (e) {
    await ctx.emit("identity", "error", `People search failed (${String(e).slice(0, 80)}) — trying general web search`);
  }
  if (!hits.length && !ctx.mock) {
    try {
      ({ hits, provider } = await search(ctx, { query: `"${input.name}" ${input.company} profile`, kind: "auto", num: 6, lane: "identity", maxChars: 800 }));
    } catch {
      /* fall through to not_found */
    }
  }
  await ctx.emit("identity", "info", `People search returned ${hits.length} profile(s) via ${provider}.`);

  let cands: Candidate[] = [];
  if (hits.length) {
    const out = await llmJson(ctx, {
      task: "identity",
      tier: "fast",
      system:
        "You resolve which public profile is the B2B prospect a sales rep named. Score each result 0-1: the name must match; current or very recent employer should match the given company; a matching job title raises the score. Different people with the same name at the same company are all plausible — do NOT guess between them.",
      user: `Prospect: ${input.name}\nCompany: ${input.company}\nTitle (may be empty): ${input.title || ""}\nRep notes: ${input.pastedContext || ""}\n\nResults:\n${hits
        .map((h, i) => `[${i}] ${h.title}\n${h.url}\n${h.text.slice(0, 600)}`)
        .join("\n\n")}`,
      shape: `{"candidates":[{"index":0,"name":"","title":"","company":"current company","location":"","matchScore":0.0,"reason":"short"}]}`,
      schema: CandidatesSchema,
      mock: () => ({
        candidates: hits.map((h, i) => {
          const p = parseTitleLine(h.title);
          const nameOk = p.name?.toLowerCase() === input.name.toLowerCase();
          const companyNow = (p.company || "").toLowerCase().includes(input.company.toLowerCase());
          const companyPast = h.text.toLowerCase().includes(input.company.toLowerCase());
          const titleOk = input.title && h.text.toLowerCase().includes(input.title.toLowerCase().split(/[ ,]/)[0]);
          const score = !nameOk ? 0.1 : 0.5 + (companyNow ? 0.3 : companyPast ? 0.25 : 0) + (titleOk ? 0.15 : 0);
          return { index: i, name: p.name || input.name, title: p.title, company: p.company, matchScore: Math.min(1, score), reason: companyNow ? "Name and current company match" : companyPast ? "Name matches; company appears in history" : "Name only" };
        }),
      }),
    });
    cands = out.candidates
      .filter((c) => hits[c.index])
      .map((c) => ({
        name: c.name,
        title: c.title || undefined,
        company: c.company || undefined,
        location: c.location || undefined,
        url: hits[c.index].url,
        matchScore: c.matchScore,
        reason: c.reason,
      }))
      .sort((a, b) => b.matchScore - a.matchScore);
  }

  const plausible = cands.filter((c) => c.matchScore >= 0.55);
  if (!plausible.length) {
    state.identity = { mode: "not_found", candidates: cands, note: "No public profile matched. Continuing with company-level research." };
    await ctx.emit("identity", "info", "No public profile found for this person — will fall back to team/company signals.");
    return "next";
  }
  const [top, second] = plausible;
  if (plausible.length === 1 || (top.matchScore >= 0.75 && top.matchScore - second.matchScore >= 0.2)) {
    state.identity = { mode: "auto", candidates: plausible, chosen: top, note: `Matched ${top.name} — ${top.title || "title unknown"} (${Math.round(top.matchScore * 100)}% match).` };
    await ctx.emit("identity", "info", state.identity.note);
    return "next";
  }
  state.identity = { mode: "rep", candidates: plausible.slice(0, 4), note: `${plausible.length} people match "${input.name}" at ${input.company}. Waiting for the rep to pick.` };
  return "pause";
}

// ───────────────────────── Freshness (job-change detection) ─────────────────────────

const FreshSchema = z.object({
  stillAtCompany: z.boolean().nullable(),
  currentCompany: z.string().nullable(),
  currentTitle: z.string().nullable(),
  evidence: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  confidence: z.number().min(0).max(1),
});

export async function stageFreshness(ctx: Ctx): Promise<"next"> {
  const { input, state } = ctx.run;
  const chosen = state.identity?.chosen;
  if (!chosen) {
    await ctx.emit("freshness", "skip", "Skipped — no confirmed person to check.");
    return "next";
  }
  const { hits } = await search(ctx, {
    query: `"${chosen.name}" joins OR appointed OR "new role" OR "has joined"`,
    kind: "news",
    sinceDays: 365,
    num: 5,
    lane: "freshness",
  }).catch(async (e) => {
    await ctx.emit("freshness", "error", `News search failed (${String(e).slice(0, 80)}) — relying on the profile only`);
    return { hits: [] as SearchHit[], provider: "error" };
  });
  const out = await llmJson(ctx, {
    task: "freshness",
    tier: "fast",
    system:
      "Decide whether the prospect still works at the company the rep's list says. Only say they moved if a source clearly states a new employer. Copy the evidence sentence verbatim.",
    user: `List says: ${chosen.name} works at ${input.company}.\nProfile: ${chosen.title || ""} at ${chosen.company || ""} — ${chosen.url || ""}\n${chosen.reason}\n\nNews:\n${hits
      .map((h) => `${h.title} (${h.publishedDate || "undated"}) ${h.url}\n${h.text.slice(0, 800)}`)
      .join("\n\n") || "(none)"}`,
    shape: `{"stillAtCompany":true,"currentCompany":"","currentTitle":"","evidence":"verbatim sentence","sourceUrl":"","confidence":0.0}`,
    schema: FreshSchema,
    mock: () => {
      const moved = chosen.company && !chosen.company.toLowerCase().includes(input.company.toLowerCase());
      const h = hits[0];
      return moved
        ? { stillAtCompany: false, currentCompany: chosen.company!, currentTitle: chosen.title || null, evidence: h ? firstSentence(h.text) : chosen.reason, sourceUrl: h?.url || chosen.url || null, confidence: 0.9 }
        : { stillAtCompany: true, currentCompany: input.company, currentTitle: chosen.title || null, evidence: null, sourceUrl: null, confidence: 0.8 };
    },
  });

  // keep the news as sources: an appointment is itself a strong, person-level signal
  for (const h of hits) pushSource(state.sources, h, "person", "job-change check");

  if (out.stillAtCompany === false && out.currentCompany && out.confidence >= 0.6) {
    state.pivot = { from: input.company, to: out.currentCompany, newTitle: out.currentTitle || undefined, evidence: out.evidence || "", sourceUrl: out.sourceUrl || undefined };
    state.target = { name: chosen.name, company: out.currentCompany, title: out.currentTitle || chosen.title };
    ctx.run.branches.push("pivot");
    await ctx.emit(
      "freshness",
      "info",
      `PIVOT: ${chosen.name} has moved from ${input.company} to ${out.currentCompany}${out.currentTitle ? ` as ${out.currentTitle}` : ""}. Re-targeting the new company — new leaders' first 90 days are a strong buying window. CRM record flagged for update.`,
    );
  } else {
    state.target = { name: chosen.name, company: input.company, title: chosen.title || input.title };
    await ctx.emit("freshness", "info", `Still at ${input.company}.`);
  }
  return "next";
}

// ───────────────────────── Gather ─────────────────────────

function pushSource(list: Source[], h: SearchHit, lane: Lane, query: string) {
  if (!h.url || list.some((s) => s.url === h.url)) return;
  list.push({ id: `S${list.length + 1}`, url: h.url, title: h.title, publishedDate: h.publishedDate, text: h.text, query, lane });
}

export async function stageGather(ctx: Ctx): Promise<"next"> {
  const { state, input } = ctx.run;
  const { name, company, title } = state.target;
  const fn = functionHint(title);
  const personKnown = !!state.identity?.chosen;

  const lanes: { lane: Lane; q: Parameters<typeof search>[1] }[] = [
    { lane: "news", q: { query: `${company}`, kind: "news", sinceDays: 120, num: 8, lane: "news" } },
    { lane: "funding", q: { query: `${company} raises funding round investment`, kind: "news", sinceDays: 365, num: 4, lane: "funding" } },
    { lane: "hiring", q: { query: `${company} careers hiring ${fn}`, kind: "auto", sinceDays: 120, num: 5, lane: "hiring" } },
    { lane: "company", q: { query: `${company}`, kind: "company", num: 1, lane: "company", maxChars: 1500 } },
    { lane: "risk", q: { query: `${company} layoffs OR acquisition OR lawsuit OR investigation OR outage`, kind: "news", sinceDays: 60, num: 5, lane: "risk" } },
  ];
  if (personKnown)
    lanes.unshift({ lane: "person", q: { query: `"${name}" ${company} interview OR podcast OR talk OR said`, kind: "auto", sinceDays: 365, num: 6, lane: "person" } });

  await Promise.all(
    lanes.map(async ({ lane, q }) => {
      const t0 = Date.now();
      try {
        const { hits, provider } = await search(ctx, q);
        hits.forEach((h) => pushSource(state.sources, h, lane, q.query));
        state.laneStats.push({ lane, ok: true, count: hits.length, ms: Date.now() - t0, provider });
        await ctx.emit("gather", "info", `${lane}: ${hits.length} result(s) via ${provider} in ${Date.now() - t0}ms`);
      } catch (e) {
        state.laneStats.push({ lane, ok: false, count: 0, ms: Date.now() - t0, provider: "error", error: String(e).slice(0, 160) });
        await ctx.emit("gather", "error", `${lane}: source failed (${String(e).slice(0, 80)}) — continuing without it`);
      }
    }),
  );
  if (input.pastedContext?.trim()) {
    state.sources.push({ id: `S${state.sources.length + 1}`, url: "rep://notes", title: "Rep-provided notes", text: input.pastedContext.trim(), query: "rep", lane: "rep", publishedDate: undefined });
    state.laneStats.push({ lane: "rep", ok: true, count: 1, ms: 0, provider: "rep" });
  }
  await ctx.emit("gather", "info", `Collected ${state.sources.length} unique source(s).`);
  return "next";
}

// ───────────────────────── Extract & score ─────────────────────────

const SIGNAL_TYPES = ["funding", "hiring", "launch", "leadership_change", "expansion", "partnership", "earnings", "person_content", "award", "layoffs", "acquisition", "legal", "crisis", "other"] as const;

const ExtractSchema = z.object({
  signals: z.array(
    z.object({
      type: z.enum(SIGNAL_TYPES),
      scope: z.enum(["person", "team", "company", "industry"]),
      claim: z.string(),
      date: z.string().nullable().optional(),
      sourceId: z.string(),
      evidence: z.string(),
      sensitivity: z.enum(["none", "negative_event", "personal"]),
    }),
  ),
});

function mockType(t: string): SignalType {
  const s = t.toLowerCase();
  if (/lay off|lays off|layoff/.test(s)) return "layoffs";
  if (/raised|raises|series [a-z]|funding/.test(s)) return "funding";
  if (/appoint|has joined|named .* as/.test(s)) return "leadership_change";
  if (/hiring|looking for/.test(s)) return "hiring";
  if (/podcast|said|interview/.test(s)) return "person_content";
  if (/opened|opens|add .* warehouse|expan/.test(s)) return "expansion";
  if (/launch/.test(s)) return "launch";
  return "other";
}

export async function stageExtract(ctx: Ctx): Promise<"next"> {
  const { state } = ctx.run;
  const { name, company, title } = state.target;
  const sources = state.sources;
  const chunks: Source[][] = [];
  for (let i = 0; i < sources.length; i += 3) chunks.push(sources.slice(i, i + 3));

  const results = await Promise.all(
    chunks.map((chunk) =>
      llmJson(ctx, {
        task: "extract",
        tier: "fast",
        system: `You turn web pages into atomic, dated, sourced facts ("signals") a B2B seller could reference.
Rules:
- Only facts about ${company} or ${name}${title ? ` (${title})` : ""} — ignore pages about other companies or other people with similar names.
- claim: one neutral sentence in your words.
- evidence: copy a sentence VERBATIM from the source text that proves the claim (no paraphrase, max 300 chars).
- date: the event date if stated, else the page's published date, ISO format; null if unknown.
- scope: person = about the prospect themself (their words, their move, their talk); team = about their function/department (e.g. hiring in their team); company; industry.
- sensitivity: personal = family/health/private life (never usable); negative_event = layoffs, lawsuits, crises, outages, the company being acquired; else none.
- Skip generic boilerplate ("X is a leading provider of...") unless nothing else exists. At most 4 signals per source.`,
        user: chunk
          .map((s) => `SOURCE ${s.id} | lane=${s.lane} | published=${s.publishedDate || "unknown"} | ${s.title}\n${s.url}\n${s.text.slice(0, 2500)}`)
          .join("\n\n---\n\n"),
        shape: `{"signals":[{"type":"${SIGNAL_TYPES.join("|")}","scope":"person|team|company|industry","claim":"","date":"YYYY-MM-DD or null","sourceId":"S1","evidence":"verbatim","sensitivity":"none|negative_event|personal"}]}`,
        maxTokens: 1800,
        schema: ExtractSchema,
        mock: () => ({
          signals: chunk
            .filter((s) => s.lane !== "company" || sources.length < 4)
            .map((s) => {
              const ev = firstSentence(s.text);
              const type = mockType(s.text);
              return {
                type,
                scope: (s.lane === "person" || s.lane === "rep" ? "person" : s.lane === "hiring" ? "team" : "company") as Signal["scope"],
                claim: ev,
                date: s.publishedDate?.slice(0, 10) ?? null,
                sourceId: s.id,
                evidence: ev,
                sensitivity: (type === "layoffs" ? "negative_event" : "none") as Signal["sensitivity"],
              };
            }),
        }),
      }).catch(async (e) => {
        await ctx.emit("extract", "error", `One extraction batch failed (${String(e).slice(0, 80)}) — continuing`);
        return { signals: [] };
      }),
    ),
  );

  let dropped = 0;
  const seen = new Set<string>();
  for (const r of results)
    for (const s of r.signals) {
      const src = sources.find((x) => x.id === s.sourceId);
      if (!src) {
        dropped++;
        continue;
      }
      const key = s.claim.toLowerCase().slice(0, 60);
      if (seen.has(key)) continue;
      seen.add(key);
      const evidenceVerified = quoteInSource(s.evidence, src.text);
      if (!evidenceVerified) dropped++;
      const date = s.date || src.publishedDate?.slice(0, 10) || undefined;
      const base = { type: s.type, scope: s.scope, claim: s.claim, date, sourceId: s.sourceId, evidence: s.evidence, evidenceVerified, sensitivity: s.sensitivity };
      state.signals.push({
        id: `G${state.signals.length + 1}`,
        ...base,
        scores: scoreSignal(base),
        excludedReason: evidenceVerified ? undefined : "Quote not found in source — treated as unverified",
      });
    }
  state.signals.sort((a, b) => b.scores.total - a.scores.total);
  const verified = state.signals.filter((s) => s.evidenceVerified).length;
  await ctx.emit("extract", "info", `${state.signals.length} signal(s) extracted; ${verified} verified against source text${dropped ? `, ${dropped} rejected (quote not in source)` : ""}.`);
  return "next";
}
