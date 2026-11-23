"use client";
import { useState } from "react";
import { STAGES, type Run, type RunEvent, type Signal, type Source } from "@/lib/types";
import { ago, Bar, ConfidencePill, money, secs, Section } from "./ui";

// ───────────── Stage timeline (live run view) ─────────────

export function StageTimeline({ run, events }: { run: Run | null; events: RunEvent[] }) {
  return (
    <ol className="relative">
      {STAGES.map((s, i) => {
        const evs = events.filter((e) => e.stage === s.id);
        const done = evs.find((e) => e.status === "done");
        const started = evs.some((e) => e.status === "start");
        const paused = evs.find((e) => e.status === "pause");
        const held = evs.find((e) => e.status === "hold");
        const failed = evs.find((e) => e.status === "error" && e.message.startsWith("Failed"));
        const skipped = evs.some((e) => e.status === "skip");
        const active = started && !done && !paused && !held && !failed && run?.status === "running";
        const state = failed ? "fail" : held ? "hold" : paused ? "pause" : done ? (skipped ? "skip" : "done") : active ? "active" : started ? "active" : "idle";
        const dot = {
          done: "bg-good text-white",
          skip: "bg-line text-muted",
          active: "bg-accent text-white",
          pause: "bg-info text-white",
          hold: "bg-warn text-white",
          fail: "bg-bad text-white",
          idle: "bg-white text-muted border border-line",
        }[state];
        const icon = { done: "✓", skip: "–", active: "", pause: "⏸", hold: "✋", fail: "!", idle: String(i + 1) }[state];
        const infos = evs.filter((e) => e.status === "info" || e.status === "error" || e.status === "skip");
        return (
          <li key={s.id} className="relative pl-10 pb-5 last:pb-0">
            {i < STAGES.length - 1 && <span className={`absolute left-[13px] top-7 bottom-0 w-px ${done ? "bg-good/40" : "bg-line"}`} />}
            <span className={`absolute left-0 top-0 w-7 h-7 rounded-full grid place-items-center text-xs font-semibold ${dot}`}>
              {state === "active" ? <span className="w-2 h-2 rounded-full bg-white pulse" /> : icon}
            </span>
            <div className="flex items-baseline gap-2">
              <span className={`text-sm font-medium ${state === "idle" ? "text-muted" : ""}`}>{s.label}</span>
              {done?.ms !== undefined && <span className="text-[11px] font-mono text-muted">{secs(done.ms)}</span>}
            </div>
            <p className="text-xs text-muted">{s.plain}</p>
            {infos.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {infos.slice(-6).map((e) => (
                  <li key={e.seq} className={`text-xs leading-snug rise ${e.status === "error" ? "text-bad" : e.message.startsWith("PIVOT") ? "text-accent font-medium" : "text-ink/80"}`}>
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ───────────── Signals board ─────────────

const SCOPE_CLS: Record<string, string> = {
  person: "bg-accent text-white",
  team: "bg-accent-soft text-accent",
  company: "bg-line text-ink",
  industry: "bg-paper text-muted",
};

export function SignalCard({ s, src, rank, winner }: { s: Signal; src?: Source; rank?: number; winner?: boolean }) {
  const excluded = !!s.excludedReason;
  return (
    <div className={`rounded-xl border p-3.5 bg-white rise ${winner ? "border-good ring-2 ring-good/20" : "border-line"} ${excluded ? "opacity-55" : ""}`}>
      <div className="flex items-center gap-2 text-[11px]">
        {rank !== undefined && <span className="font-mono text-muted">#{rank}</span>}
        <span className={`px-1.5 py-0.5 rounded font-semibold uppercase tracking-wide ${SCOPE_CLS[s.scope]}`}>{s.scope}</span>
        <span className="text-muted">{s.type.replace("_", " ")}</span>
        <span className="text-muted">· {ago(s.date)}</span>
        {winner && <span className="ml-auto text-good font-semibold">USED IN DRAFT</span>}
        {!winner && <span className="ml-auto font-mono text-muted">{s.id}</span>}
      </div>
      <p className="text-sm mt-2 leading-snug">{s.claim}</p>
      <blockquote className="mt-2 text-xs text-muted border-l-2 border-line pl-2 italic line-clamp-3">&ldquo;{s.evidence}&rdquo;</blockquote>
      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[10px] text-muted">
        <div>
          Recency <Bar value={s.scores.recency} tone="accent" />
        </div>
        <div>
          Specificity <Bar value={s.scores.specificity} tone="accent" />
        </div>
        <div>
          Verified <Bar value={s.scores.verifiability} tone={s.evidenceVerified ? "good" : "warn"} />
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[11px]">
        <span className="font-mono">score {s.scores.total.toFixed(2)}</span>
        {src && (
          <a href={src.url.startsWith("rep://") ? undefined : src.url} target="_blank" rel="noreferrer" className="ml-auto text-accent truncate max-w-[60%]" title={src.title}>
            {src.id} · {src.title} ↗
          </a>
        )}
      </div>
      {excluded && <p className="mt-1.5 text-[11px] text-warn">⊘ {s.excludedReason}</p>}
    </div>
  );
}

export function SignalsBoard({ run }: { run: Run }) {
  const [showAll, setShowAll] = useState(false);
  const st = run.state;
  const winner = st.hooks?.find((h) => h.id === st.winnerId);
  const list = showAll ? st.signals : st.signals.slice(0, 6);
  return (
    <Section
      title="Signals found"
      hint="Each one is a dated fact, quoted from its source and scored."
      right={st.signals.length > 6 && <button className="text-xs text-accent" onClick={() => setShowAll(!showAll)}>{showAll ? "Show top 6" : `Show all ${st.signals.length}`}</button>}
    >
      {st.signals.length === 0 ? (
        <p className="text-sm text-muted">No usable signals found.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {list.map((s, i) => (
            <SignalCard key={s.id} s={s} rank={i + 1} src={st.sources.find((x) => x.id === s.sourceId)} winner={winner?.signalIds.includes(s.id)} />
          ))}
        </div>
      )}
    </Section>
  );
}

// ───────────── Hook tournament ─────────────

export function HookTournament({ run }: { run: Run }) {
  const st = run.state;
  if (!st.hooks) return null;
  return (
    <Section title="Hook tournament" hint="Three angles pitched; a separate judge scores them. Highest score wins.">
      <div className="grid md:grid-cols-3 gap-3">
        {st.hooks.map((h, i) => {
          const win = h.id === st.winnerId;
          const vp = run.seller.valueProps.find((v) => v.id === h.valuePropId);
          const j = h.judge;
          return (
            <div key={h.id} className={`rounded-xl border p-4 rise ${win ? "border-good bg-good-soft/40 ring-2 ring-good/20" : "border-line bg-white"}`} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-muted">{h.id}</span>
                {win ? <span className="text-[11px] font-bold text-good">🏆 WINNER</span> : <span className="text-[11px] text-muted">runner-up</span>}
              </div>
              <p className="text-sm font-medium mt-2 leading-snug">{h.angle}</p>
              <div className="mt-3 space-y-1 text-xs">
                <p>
                  <span className="text-muted">Signal →</span> {h.signalIds.join(", ") || "none (role-based)"}
                </p>
                <p>
                  <span className="text-muted">Pain →</span> {h.pain}
                </p>
                <p>
                  <span className="text-muted">Offer →</span> {vp?.title}
                </p>
              </div>
              {j && (
                <div className="mt-3 pt-3 border-t border-line space-y-1">
                  {(["relevance", "specificity", "timeliness", "credibility", "tact"] as const).map((k) => (
                    <div key={k} className="grid grid-cols-[80px_1fr_16px] items-center gap-2 text-[11px]">
                      <span className="text-muted capitalize">{k}</span>
                      <Bar value={j[k]} max={5} tone={win ? "good" : "muted"} />
                      <span className="font-mono">{j[k]}</span>
                    </div>
                  ))}
                  <p className="text-xs mt-2 font-mono">score {j.total.toFixed(2)}</p>
                  <p className="text-xs text-muted italic">{j.comment}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {st.avoidedSignals?.length ? <p className="text-xs text-info mt-3">⇄ Skipped {st.avoidedSignals.join(", ")} — already used for a colleague at this account in the same batch.</p> : null}
    </Section>
  );
}

// ───────────── Verification ─────────────

export function Verification({ run }: { run: Run }) {
  const st = run.state;
  if (!st.claimChecks) return null;
  return (
    <Section title="Verification" hint="Every factual claim is checked against a source before a human sees it.">
      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <p className="label mb-2">Claims in the final draft</p>
          <ul className="space-y-1.5">
            {st.claimChecks.map((c, i) => (
              <li key={i} className="text-sm flex gap-2">
                <span className={c.verdict === "supported" ? "text-good" : "text-bad"}>{c.verdict === "supported" ? "✓" : "✗"}</span>
                <span>
                  {c.statement} <span className="font-mono text-xs text-muted">{c.signalId || ""}</span>
                  {c.note && <span className="block text-xs text-muted">{c.note}</span>}
                </span>
              </li>
            ))}
            {!st.claimChecks.length && <li className="text-sm text-muted">No factual claims about the prospect (relevance-based note).</li>}
          </ul>
          {st.claimsCaught?.length ? (
            <div className="mt-4 rounded-lg bg-bad-soft p-3">
              <p className="text-xs font-semibold text-bad">Caught in the first draft:</p>
              {st.claimsCaught.map((c, i) => (
                <p key={i} className="text-sm mt-1 line-through decoration-bad/60">
                  {c.statement}
                </p>
              ))}
              <p className="text-xs text-muted mt-1">
                No source supported {st.claimsCaught.length === 1 ? "this" : "these"}, so the draft was sent back for a rewrite before the rep saw it.
                {st.unresolvedClaims?.length ? ` ${st.unresolvedClaims.length} still could not be removed. See the warning on the draft.` : ""}
              </p>
            </div>
          ) : null}
        </div>
        <div>
          <p className="label mb-2">Quality rules</p>
          <ul className="space-y-1">
            {st.lint?.map((l) => (
              <li key={l.rule} className="text-sm flex items-center gap-2">
                <span className={l.ok ? "text-good" : "text-warn"}>{l.ok ? "✓" : "!"}</span>
                <span>{l.rule}</span>
                <span className="ml-auto text-xs text-muted font-mono">{l.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  );
}

// ───────────── Sources & cost ─────────────

export function SourcesAndCost({ run }: { run: Run }) {
  const st = run.state;
  const m = run.metrics;
  return (
    <Section title="Sources & run cost" hint="Where the research came from, and what this draft cost to make.">
      <div className="grid md:grid-cols-[1fr_260px] gap-6">
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {st.laneStats.map((l, i) => (
              <span key={i} className={`text-xs px-2 py-1 rounded-md border ${l.ok ? (l.count ? "border-line" : "border-line text-muted") : "border-bad text-bad"}`} title={l.error}>
                {l.lane}: {l.ok ? `${l.count}` : "failed"} <span className="text-muted">· {l.provider} · {secs(l.ms)}</span>
              </span>
            ))}
          </div>
          <ol className="space-y-1 text-sm max-h-56 overflow-auto">
            {st.sources.map((s) => (
              <li key={s.id} className="flex gap-2">
                <span className="font-mono text-xs text-muted w-7 shrink-0 pt-0.5">{s.id}</span>
                {s.url.startsWith("rep://") ? (
                  <span>{s.title}</span>
                ) : (
                  <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-accent truncate">
                    {s.title}
                  </a>
                )}
                <span className="ml-auto text-xs text-muted shrink-0">{ago(s.publishedDate)}</span>
              </li>
            ))}
          </ol>
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm content-start">
          {[
            ["Wall time", secs(m.ms)],
            ["Est. cost", money(m.costUsd + m.searchCostUsd)],
            ["LLM calls", String(m.llmCalls)],
            ["Searches", String(m.searchCalls)],
            ["Tokens in", m.inputTokens.toLocaleString()],
            ["Tokens out", m.outputTokens.toLocaleString()],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg bg-paper p-2.5">
              <dt className="text-[11px] text-muted">{k}</dt>
              <dd className="font-mono font-medium">{v}</dd>
            </div>
          ))}
          <div className="col-span-2 text-[11px] text-muted">vs. ~20 min of manual research per prospect</div>
        </dl>
      </div>
    </Section>
  );
}

export function ConfidenceLine({ run }: { run: Run }) {
  if (!run.state.confidence) return null;
  return (
    <div className="flex items-center gap-2 text-sm">
      <ConfidencePill c={run.state.confidence} />
      <span className="text-muted">{run.state.confidenceWhy}</span>
    </div>
  );
}
