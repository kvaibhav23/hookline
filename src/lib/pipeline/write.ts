import { z } from "zod";
import type { Ctx } from "../ctx";
import { llmJson } from "../llm";
import { search } from "../search";
import { getStore } from "../store";
import type { Candidate, ClaimCheck, Confidence, Draft, Hook, LintResult, Signal } from "../types";
import { addDays, daysSince, functionHint, parseTitleLine, words } from "./util";

// ───────────────────────── Sensitivity gate ─────────────────────────
// Deterministic rules, not vibes: a buyer can read exactly why we held.

const HOLD_TYPES = new Set(["layoffs", "acquisition", "legal", "crisis"]);

export async function stageGate(ctx: Ctx): Promise<"next" | "hold"> {
  const { state, seller } = ctx.run;
  const company = state.target.company.toLowerCase();
  const reasons: string[] = [];
  const filtered: string[] = [];
  let revisitOn: string | undefined;

  if (seller.customers.some((c) => c && company.includes(c.toLowerCase())))
    reasons.push(`${state.target.company} is already a customer — route to the account manager instead of cold outreach.`);
  if (seller.competitors.some((c) => c && company.includes(c.toLowerCase())))
    reasons.push(`${state.target.company} is listed as a competitor — do not contact.`);

  for (const s of state.signals) {
    if (s.sensitivity === "personal") {
      s.excludedReason = "Personal-life detail — never used as a hook";
      filtered.push(s.id);
      continue;
    }
    const age = daysSince(s.date);
    if (s.evidenceVerified && (s.sensitivity === "negative_event" || HOLD_TYPES.has(s.type)) && age !== null && age <= 30 && s.scope !== "industry") {
      reasons.push(`${s.claim} (${age} day${age === 1 ? "" : "s"} ago, ${s.sourceId}). A sales pitch now reads as tone-deaf and can burn the account.`);
      const r = addDays(s.date!, 45);
      if (!revisitOn || r > revisitOn) revisitOn = r;
      s.excludedReason = "Sensitive event — not used as a hook";
      filtered.push(s.id);
    } else if (s.sensitivity === "negative_event") {
      s.excludedReason = "Negative event (older than 30 days) — not used as a hook";
      filtered.push(s.id);
    }
  }

  if (reasons.length) {
    state.gate = { decision: "hold", reasons, revisitOn, filtered };
    ctx.run.branches.push("hold");
    return "hold";
  }
  state.gate = { decision: "proceed", reasons: [], filtered };
  await ctx.emit("gate", "info", filtered.length ? `Clear to proceed. ${filtered.length} signal(s) filtered out as unsuitable for a hook.` : "Clear to proceed — no sensitive events in the last 30 days.");
  return "next";
}

// ───────────────────────── Hook tournament ─────────────────────────

const HooksSchema = z.object({
  hooks: z
    .array(
      z.object({
        signalIds: z.array(z.string()),
        angle: z.string(),
        pain: z.string(),
        valuePropId: z.string(),
        proofPointId: z.string().nullable().optional(),
      }),
    )
    .min(1)
    .max(3),
});

const JudgeSchema = z.object({
  scores: z.array(
    z.object({
      hookId: z.string(),
      relevance: z.number().min(1).max(5),
      specificity: z.number().min(1).max(5),
      timeliness: z.number().min(1).max(5),
      credibility: z.number().min(1).max(5),
      tact: z.number().min(1).max(5),
      comment: z.string(),
    }),
  ),
});

const usable = (s: Signal) => s.evidenceVerified && !s.excludedReason && s.sensitivity === "none";

const kw = (s: string) => new Set(s.toLowerCase().match(/[a-z]{4,}/g) || []);
const overlap = (a: string, b: string) => {
  const A = kw(a);
  let n = 0;
  for (const w of kw(b)) if (A.has(w)) n++;
  return n;
};

export async function stageHooks(ctx: Ctx): Promise<"next"> {
  const { state, seller, input } = ctx.run;
  let pool = state.signals.filter(usable);

  // Same-account collision: don't give two people at one company the same hook.
  if (input.batchId) {
    const siblings = (await getStore().listRuns(500)).filter(
      (r) => r.id !== ctx.run.id && r.input.batchId === input.batchId && r.state.target?.company?.toLowerCase() === state.target.company.toLowerCase() && r.state.winnerId,
    );
    const usedUrls = new Set<string>();
    for (const r of siblings) {
      const w = r.state.hooks?.find((h) => h.id === r.state.winnerId);
      for (const sid of w?.signalIds || []) {
        const sig = r.state.signals.find((x) => x.id === sid);
        const src = r.state.sources.find((x) => x.id === sig?.sourceId);
        if (src) usedUrls.add(src.url);
      }
    }
    if (usedUrls.size) {
      const fresh = pool.filter((s) => !usedUrls.has(state.sources.find((x) => x.id === s.sourceId)?.url || ""));
      const avoided = pool.filter((s) => !fresh.includes(s)).map((s) => s.id);
      if (avoided.length && fresh.length) {
        pool = fresh;
        state.avoidedSignals = avoided;
        ctx.run.branches.push("collision-avoided");
        await ctx.emit("hooks", "info", `A colleague at ${state.target.company} in this batch already got a hook built on ${avoided.join(", ")} — choosing a different angle.`);
      }
    }
  }

  // Degrade ladder: person → team → company → industry → relevance-only
  const hasPersonal = pool.some((s) => s.scope === "person" || s.scope === "team");
  if (!hasPersonal || state.identity?.mode === "not_found") {
    if (!ctx.run.branches.includes("degrade")) ctx.run.branches.push("degrade");
    await ctx.emit("hooks", "info", pool.length ? "No person-level signal — falling back to team/company signals (degrade ladder)." : "No usable signals at all — writing a short, honest relevance-based note and suggesting other contacts.");
    state.alternates = await findAlternates(ctx);
  }

  const top = pool.slice(0, 8);
  const sigText = top.map((s) => `${s.id} [${s.type}, ${s.scope}, ${s.date || "undated"}, score ${s.scores.total}] ${s.claim}`).join("\n") || "(no usable signals)";
  const sellerText = `Seller: ${seller.name}\n${seller.oneLiner}\nValue props:\n${seller.valueProps.map((v) => `${v.id}: ${v.title} — ${v.description}`).join("\n")}\nProof points:\n${seller.proofPoints.map((p) => `${p.id}: ${p.text}`).join("\n")}`;
  const who = `${state.target.name}${state.target.title ? `, ${state.target.title}` : ""} at ${state.target.company}${state.pivot ? ` (joined recently from ${state.pivot.from})` : ""}`;

  const gen = await llmJson(ctx, {
    task: "hooks",
    tier: "smart",
    system: `You are a senior SDR. Propose 3 DIFFERENT outreach angles. Each angle bridges: a real signal about the prospect → the pain it likely creates for someone in their role → ONE specific value prop of the seller (+ a proof point if it fits).
Use only the signal IDs given. Prefer recent, person/team-level signals. If there are no signals, propose role-based angles with an empty signalIds list. Never use personal-life details.`,
    user: `Prospect: ${who}\n\nSignals:\n${sigText}\n\n${sellerText}`,
    shape: `{"hooks":[{"signalIds":["G1"],"angle":"one line","pain":"likely pain for this person","valuePropId":"V1","proofPointId":"P1 or null"}]}`,
    schema: HooksSchema,
    mock: () => {
      const picks = top.length ? top.slice(0, 3) : [null];
      return {
        hooks: picks.map((s) => {
          const text = s?.claim || state.target.title || "";
          const vp = [...seller.valueProps].sort((a, b) => overlap(b.description + b.title, text) - overlap(a.description + a.title, text))[0];
          return {
            signalIds: s ? [s.id] : [],
            angle: s ? `${s.type.replace("_", " ")}: ${s.claim.length > 90 ? s.claim.slice(0, s.claim.lastIndexOf(" ", 90)) + "…" : s.claim}` : `Role-based: ${state.target.title || "finance leader"} at a growing company`,
            pain: s ? `This likely adds load on ${functionHint(state.target.title)} work` : "Manual operational work grows with the company",
            valuePropId: vp.id,
            proofPointId: seller.proofPoints[0]?.id ?? null,
          };
        }),
      };
    },
  });
  const hooks: Hook[] = gen.hooks.map((h, i) => ({ ...h, proofPointId: h.proofPointId || undefined, signalIds: h.signalIds.filter((id) => top.some((s) => s.id === id)), id: `H${i + 1}` }));

  const judged = await llmJson(ctx, {
    task: "judge",
    tier: "smart",
    system: `You are a skeptical sales manager judging outreach angles before a rep uses them. Score 1-5:
relevance (does the signal genuinely connect to the value prop for THIS role?), specificity (would it only make sense for this person?), timeliness (is the signal fresh?), credibility (is it grounded, not a stretch?), tact (would the prospect find it appropriate, not creepy or presumptuous?). Comment in one plain-English sentence a non-technical buyer would understand.`,
    user: `Prospect: ${who}\n\nSignals:\n${sigText}\n\n${sellerText}\n\nAngles:\n${hooks.map((h) => `${h.id}: ${h.angle}\n  pain: ${h.pain}\n  uses: ${h.signalIds.join(",") || "none"} → ${h.valuePropId}`).join("\n")}`,
    shape: `{"scores":[{"hookId":"H1","relevance":1,"specificity":1,"timeliness":1,"credibility":1,"tact":1,"comment":""}]}`,
    schema: JudgeSchema,
    mock: () => ({
      scores: hooks.map((h) => {
        const sigs = top.filter((s) => h.signalIds.includes(s.id));
        const vp = seller.valueProps.find((v) => v.id === h.valuePropId);
        const rel = Math.min(5, 2 + overlap(vp?.description || "", sigs.map((s) => s.claim).join(" ")));
        const fresh = sigs.length ? Math.max(1, Math.round(5 * Math.max(...sigs.map((s) => s.scores.recency)))) : 2;
        const spec = sigs.some((s) => s.scope === "person") ? 5 : sigs.some((s) => s.scope === "team") ? 4 : sigs.length ? 3 : 1;
        return { hookId: h.id, relevance: rel, specificity: spec, timeliness: fresh, credibility: sigs.length ? 4 : 2, tact: 5, comment: sigs.length ? `Connects "${sigs[0].claim.slice(0, 60)}…" to ${vp?.title}.` : "Generic, role-based angle — only usable as a fallback." };
      }),
    }),
  });

  for (const h of hooks) {
    const j = judged.scores.find((x) => x.hookId === h.id);
    const sigs = top.filter((s) => h.signalIds.includes(s.id));
    const sigScore = sigs.length ? sigs.reduce((a, s) => a + s.scores.total, 0) / sigs.length : 0.25;
    const judgeNorm = j ? (j.relevance * 1.5 + j.specificity + j.timeliness + j.credibility + j.tact * 1.5 - 6) / 24 : 0.4;
    h.judge = j
      ? { relevance: j.relevance, specificity: j.specificity, timeliness: j.timeliness, credibility: j.credibility, tact: j.tact, comment: j.comment, total: Math.round((0.6 * judgeNorm + 0.4 * sigScore) * 100) / 100 }
      : undefined;
  }
  hooks.sort((a, b) => (b.judge?.total ?? 0) - (a.judge?.total ?? 0));
  const winner = hooks[0];
  state.hooks = hooks;
  state.winnerId = winner.id;

  const wSigs = top.filter((s) => winner.signalIds.includes(s.id));
  const best = wSigs[0];
  const age = daysSince(best?.date);
  let conf: Confidence = "LOW";
  let why = "No verified signal specific to this person — the note relies on role relevance.";
  if (best && (best.scope === "person" || best.scope === "team") && (age ?? 999) <= 90 && state.identity?.mode !== "not_found") {
    conf = "HIGH";
    why = `Built on a ${best.scope}-level signal from ${age} days ago, verified against its source.`;
  } else if (best && (age ?? 999) <= 120) {
    conf = "MEDIUM";
    why = `Built on a ${best.scope}-level signal${age !== null ? ` from ${age} days ago` : ""}; nothing more specific to the person was found.`;
  }
  state.confidence = conf;
  state.confidenceWhy = why;
  state.winnerRationale = `${winner.judge?.comment ?? ""} Scored ${winner.judge?.total} vs ${hooks
    .slice(1)
    .map((h) => h.judge?.total)
    .join(" / ")}.`;
  await ctx.emit("hooks", "info", `Winner ${winner.id}: ${winner.angle} (score ${winner.judge?.total}). Confidence ${conf}.`);
  return "next";
}

async function findAlternates(ctx: Ctx): Promise<Candidate[]> {
  const { state } = ctx.run;
  try {
    const { hits } = await search(ctx, { query: `${state.target.company} ${functionHint(state.target.title)} head OR director OR controller`, kind: "people", num: 5, lane: "alternates", maxChars: 500 });
    return hits
      .map((h) => {
        const p = parseTitleLine(h.title);
        return { name: p.name || h.title, title: p.title, company: p.company, url: h.url, matchScore: 0.5, reason: "Senior person in the relevant function — may have more public signal" };
      })
      .filter((c) => c.name.toLowerCase() !== state.target.name.toLowerCase())
      .slice(0, 3);
  } catch {
    return [];
  }
}

// ───────────────────────── Draft ─────────────────────────

const DraftSchema = z.object({
  subject: z.string(),
  body: z.string(),
  linkedin: z.string(),
  claims: z.array(z.object({ text: z.string(), signalId: z.string() })),
});

function draftPrompt(ctx: Ctx, feedback?: string) {
  const { state, seller } = ctx.run;
  const w = state.hooks!.find((h) => h.id === state.winnerId)!;
  const sigs = state.signals.filter((s) => w.signalIds.includes(s.id));
  const vp = seller.valueProps.find((v) => v.id === w.valuePropId);
  const pp = seller.proofPoints.find((p) => p.id === w.proofPointId);
  return {
    system: `You write first-touch B2B emails that get replies. Rules:
- Body ≤ 110 words, 3 short paragraphs max, plain text. Subject ≤ 6 words, specific, no clickbait.
- Open with the prospect's situation (the signal), never with "I hope…", "I came across your profile" or praise.
- One sentence on the likely pain, one on how the seller helps (+ proof point if given), then ONE call to action.
- State ONLY facts present in the signals below. No invented numbers, names, awards or quotes. If confidence is LOW, don't fake familiarity — be brief and honest that you're reaching out because of their role.
- Never mention personal life. Don't say how you found the information.
- Sign off with the sender's first name.
- LinkedIn note: ≤ 280 characters, same hook, softer ask.
- claims: list every fragment of the body that states a fact about the prospect or their company, with the signal ID that supports it.
Tone: ${seller.tone}`,
    user: `Prospect: ${state.target.name}${state.target.title ? `, ${state.target.title}` : ""} at ${state.target.company}${state.pivot ? `\nNote: they joined ${state.target.company} recently (moved from ${state.pivot.from}).` : ""}
Confidence: ${state.confidence}
Angle: ${w.angle}
Pain: ${w.pain}
Signals:\n${sigs.map((s) => `${s.id} (${s.date || "undated"}): ${s.claim}\n  evidence: "${s.evidence}"`).join("\n") || "(none)"}
Value prop: ${vp?.title} — ${vp?.description}
Proof point: ${pp?.text || "(none)"}
CTA: ${seller.cta}
Sender: ${seller.senderName}, ${seller.senderTitle}, ${seller.name}${feedback ? `\n\nREVISION REQUIRED — fix these problems and change nothing else:\n${feedback}` : ""}`,
    sigs,
    vp,
    pp,
  };
}

function mockDraft(ctx: Ctx, revise: boolean): Draft {
  const { state, seller } = ctx.run;
  const p = draftPrompt(ctx);
  const s = p.sigs[0];
  const first = state.target.name.split(" ")[0];
  const open = s ? `${s.claim.replace(/\.$/, "")} — ` : `As ${state.target.title || "someone leading this function"} at ${state.target.company}, `;
  const pain = s ? "that usually means more manual work landing on your team before the systems catch up." : "you're probably juggling more manual work than the team size suggests.";
  const fabricated = !revise && /finlark/i.test(state.target.company) && /priya/i.test(state.target.name) ? " Congrats on being named to the Fintech 40 Under 40 list, too." : "";
  const body = `Hi ${first},\n\n${open}${pain}${fabricated}\n\nWe help teams like yours with ${p.vp?.title.toLowerCase()}: ${p.vp?.description.split(";")[0].toLowerCase()}.${p.pp ? ` ${p.pp.text}` : ""}\n\n${seller.cta}\n\n${seller.senderName}`;
  const claims = s ? [{ text: s.claim.replace(/\.$/, ""), signalId: s.id }] : [];
  if (fabricated) claims.push({ text: "named to the Fintech 40 Under 40 list", signalId: "NONE" });
  return {
    subject: s ? `${state.target.company}: ${s.type.replace("_", " ")}` : `${state.target.company} ${functionHint(state.target.title).split(" ")[0]} ops`,
    body,
    linkedin: `Hi ${first} — ${s ? s.claim.slice(0, 120) : `saw you lead ${functionHint(state.target.title).split(" ")[0]} at ${state.target.company}`}. We help teams with ${p.vp?.title.toLowerCase()}. Open to connecting?`.slice(0, 280),
    claims,
  };
}

export async function stageDraft(ctx: Ctx): Promise<"next"> {
  const p = draftPrompt(ctx);
  const d = await llmJson(ctx, {
    task: "draft",
    tier: "smart",
    system: p.system,
    user: p.user,
    shape: `{"subject":"","body":"","linkedin":"","claims":[{"text":"exact fragment from body","signalId":"G1"}]}`,
    schema: DraftSchema,
    mock: () => mockDraft(ctx, false),
  });
  ctx.run.state.draft = d;
  await ctx.emit("draft", "info", `Drafted email (${words(d.body).length} words) + LinkedIn note (${d.linkedin.length} chars).`);
  return "next";
}

// ───────────────────────── Verify (claim firewall + lint) ─────────────────────────

const VerifySchema = z.object({
  statements: z.array(z.object({ statement: z.string(), signalId: z.string().nullable(), verdict: z.enum(["supported", "unsupported"]), note: z.string().nullable().optional() })),
});

const BANNED: [RegExp, string, "error" | "warn"][] = [
  [/hope (this|you|all)[^.]*well/i, '"Hope this finds you well" opener', "warn"],
  [/came across your (profile|post)|saw your linkedin/i, "Says how we found them", "error"],
  [/\b(synerg|game[- ]chang|revolutioni[sz]|cutting[- ]edge|world[- ]class|best[- ]in[- ]class)/i, "Hype words", "warn"],
  [/circle back|touch base|just checking in|quick question/i, "Filler phrases", "warn"],
  [/\[[^\]]{2,}\]|\{\{|<[A-Z_]{3,}>/, "Unfilled placeholder", "error"],
  [/\b(wife|husband|kids|daughter|son|wedding|vacation|holiday|health|hospital|baby)\b/i, "Personal-life reference", "error"],
];

export function lintDraft(d: Draft): LintResult[] {
  const n = words(d.body).length;
  const out: LintResult[] = [
    { rule: "Length ≤ 125 words", ok: n <= 125, detail: `${n} words` },
    { rule: "Subject ≤ 8 words", ok: words(d.subject).length <= 8, detail: `${words(d.subject).length} words` },
    { rule: "One call to action", ok: (d.body.match(/\?/g) || []).length <= 2, detail: `${(d.body.match(/\?/g) || []).length} question mark(s)` },
    { rule: "LinkedIn note ≤ 300 chars", ok: d.linkedin.length <= 300, detail: `${d.linkedin.length} chars` },
    { rule: "Opens with them, not us", ok: !/^\s*(i|we|our|my)\b/i.test(d.body.replace(/^\s*(hi|hello|hey|dear)[^\n]*\n+/i, "")), detail: "First word after greeting" },
  ];
  for (const [re, label] of BANNED) {
    const m = (d.subject + "\n" + d.body + "\n" + d.linkedin).match(re);
    out.push({ rule: `No ${label.toLowerCase()}`, ok: !m, detail: m ? `found "${m[0]}"` : "clean" });
  }
  return out;
}
const lintErrors = (l: LintResult[]) =>
  l.filter((x) => !x.ok && (x.rule.startsWith("Length") || x.rule.startsWith("LinkedIn") || BANNED.some(([, lab, sev]) => sev === "error" && x.rule === `No ${lab.toLowerCase()}`)));

async function checkClaims(ctx: Ctx, d: Draft): Promise<ClaimCheck[]> {
  const sigs = ctx.run.state.signals.filter((s) => s.evidenceVerified && !s.excludedReason);
  const out = await llmJson(ctx, {
    task: "verify",
    tier: "fast",
    system: `You are a fact-checker. List EVERY factual assertion in the email about the prospect, their company, their team or their industry (ignore claims about the seller and ignore the call to action). For each, find the signal whose evidence directly supports it. "supported" only if the evidence states it; anything embellished, inferred as fact, or invented (numbers, awards, titles, dates) is "unsupported".`,
    user: `EMAIL\nSubject: ${d.subject}\n${d.body}\n\nSIGNALS\n${sigs.map((s) => `${s.id}: ${s.claim}\n  evidence: "${s.evidence}"`).join("\n") || "(none)"}`,
    shape: `{"statements":[{"statement":"","signalId":"G1 or null","verdict":"supported|unsupported","note":""}]}`,
    schema: VerifySchema,
    mock: () => ({
      statements: d.claims.map((c) => {
        const ok = sigs.some((s) => s.id === c.signalId);
        return { statement: c.text, signalId: ok ? c.signalId : null, verdict: ok ? ("supported" as const) : ("unsupported" as const), note: ok ? null : "No source mentions this." };
      }),
    }),
  });
  return out.statements.map((s) => ({ statement: s.statement, signalId: s.signalId, verdict: s.verdict, note: s.note || undefined }));
}

export async function stageVerify(ctx: Ctx): Promise<"next"> {
  const { state } = ctx.run;
  let d = state.draft!;
  let checks = await checkClaims(ctx, d);
  let lint = lintDraft(d);
  const bad = checks.filter((c) => c.verdict === "unsupported");
  const errs = lintErrors(lint);

  if (bad.length || errs.length) {
    state.firstDraft = d;
    state.claimsCaught = bad;
    ctx.run.branches.push("revised");
    await ctx.emit("verify", "info", `Caught ${bad.length} unsupported claim(s)${errs.length ? ` and ${errs.length} rule violation(s)` : ""} — sending back for revision.`);
    const feedback = [
      ...bad.map((b) => `- Remove or fix (not supported by any source): "${b.statement}"`),
      ...errs.map((e) => `- ${e.rule} (${e.detail})`),
    ].join("\n");
    const p = draftPrompt(ctx, feedback);
    d = await llmJson(ctx, {
      task: "revise",
      tier: "smart",
      system: p.system,
      user: p.user,
      shape: `{"subject":"","body":"","linkedin":"","claims":[{"text":"","signalId":"G1"}]}`,
      schema: DraftSchema,
      mock: () => mockDraft(ctx, true),
    });
    checks = await checkClaims(ctx, d);
    lint = lintDraft(d);
    // Firewall: if anything is STILL unsupported, cut the sentence rather than ship it.
    for (const c of checks.filter((x) => x.verdict === "unsupported")) {
      const sentences = d.body.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((s) => !s.toLowerCase().includes(c.statement.toLowerCase().slice(0, 40)));
      if (kept.length < sentences.length) {
        d = { ...d, body: kept.join(" ") };
        c.note = "Sentence removed automatically by the claim firewall";
      }
    }
  }
  state.draft = d;
  state.claimChecks = checks;
  state.lint = lint;
  const sup = checks.filter((c) => c.verdict === "supported").length;
  await ctx.emit("verify", "info", `${sup}/${checks.length} factual claim(s) supported by sources. ${lint.filter((l) => l.ok).length}/${lint.length} quality checks passed.`);
  return "next";
}
