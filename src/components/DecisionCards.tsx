"use client";
import { useState } from "react";
import type { Run } from "@/lib/types";

export function IdentityPicker({ run, onResumed }: { run: Run; onResumed: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);
  const cands = run.state.identity?.candidates || [];
  const pick = async (i: number) => {
    setBusy(i);
    await fetch(`/api/runs/${run.id}/resume`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ index: i }) });
    onResumed();
  };
  return (
    <div className="card p-5 border-info rise" style={{ borderColor: "var(--color-info)" }}>
      <p className="label !text-info">⏸ Paused — your call</p>
      <h3 className="text-lg font-semibold mt-1">{run.state.identity?.note}</h3>
      <p className="text-sm text-muted mt-1">Guessing here could mean emailing the wrong person, so the process stops and asks. It picks up from here as soon as you choose.</p>
      <div className="grid md:grid-cols-3 gap-3 mt-4">
        {cands.map((c, i) => (
          <button key={i} onClick={() => pick(i)} disabled={busy !== null} className="text-left rounded-xl border border-line bg-white p-4 hover:border-info transition">
            <p className="font-medium">{c.name}</p>
            <p className="text-sm">{c.title || "Title unknown"}</p>
            <p className="text-xs text-muted">{[c.company, c.location].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-muted mt-2">{c.reason}</p>
            <p className="text-xs font-mono mt-2">{Math.round(c.matchScore * 100)}% match</p>
            {c.url && <p className="text-[11px] text-info truncate mt-1">{c.url}</p>}
            <span className="inline-block mt-3 text-sm font-medium text-info">{busy === i ? "Resuming…" : "This one →"}</span>
          </button>
        ))}
      </div>
      <button onClick={() => pick(-1)} disabled={busy !== null} className="mt-3 text-sm text-muted hover:text-ink">
        None of these — continue with company-level research
      </button>
    </div>
  );
}

export function PivotCard({ run }: { run: Run }) {
  const p = run.state.pivot!;
  return (
    <div className="card p-5 rise" style={{ borderColor: "var(--color-accent)" }}>
      <p className="label !text-accent">↪ Pivot — your list is out of date</p>
      <h3 className="text-lg font-semibold mt-1">
        {run.state.target.name} moved from <span className="line-through decoration-2 text-muted">{p.from}</span> to {p.to}
        {p.newTitle ? ` as ${p.newTitle}` : ""}
      </h3>
      {p.evidence && <blockquote className="text-sm text-muted italic border-l-2 border-accent/40 pl-3 mt-2">&ldquo;{p.evidence}&rdquo;</blockquote>}
      <div className="grid md:grid-cols-2 gap-3 mt-4 text-sm">
        <div className="rounded-lg bg-accent-soft p-3">
          <p className="font-medium">What the process did</p>
          <p className="text-muted mt-0.5">Researched the new company instead. New leaders often buy in their first 90 days, so the move itself is the hook.</p>
        </div>
        <div className="rounded-lg bg-paper p-3">
          <p className="font-medium">CRM update suggested</p>
          <p className="font-mono text-xs mt-1">
            company: {p.from} → {p.to}
            {p.newTitle ? (
              <>
                <br />
                title: → {p.newTitle}
              </>
            ) : null}
          </p>
          <p className="text-xs text-muted mt-1">Also worth a separate note to whoever replaced them at {p.from}.</p>
        </div>
      </div>
    </div>
  );
}

export function HoldCard({ run }: { run: Run }) {
  const g = run.state.gate!;
  return (
    <div className="card p-6 rise" style={{ borderColor: "var(--color-warn)" }}>
      <p className="label !text-warn">✋ Hold — don&apos;t reach out right now</p>
      <h3 className="text-xl font-semibold mt-1">No draft was written, on purpose.</h3>
      <ul className="mt-3 space-y-2">
        {g.reasons.map((r, i) => (
          <li key={i} className="text-sm">
            • {r}
          </li>
        ))}
      </ul>
      <div className="grid md:grid-cols-3 gap-3 mt-5 text-sm">
        <div className="rounded-lg bg-warn-soft p-3">
          <p className="text-xs text-warn font-semibold">REVISIT ON</p>
          <p className="font-mono text-lg">{g.revisitOn || "—"}</p>
        </div>
        <div className="rounded-lg bg-paper p-3 md:col-span-2">
          <p className="font-medium">Suggested next step</p>
          <p className="text-muted">Move to a nurture list and re-run on the revisit date. The process will check again whether things have settled.</p>
        </div>
      </div>
    </div>
  );
}

export function AlternatesCard({ run }: { run: Run }) {
  const a = run.state.alternates || [];
  return (
    <div className="card p-5 rise">
      <p className="label">⤓ Degrade — thin public signal</p>
      <p className="text-sm mt-1">
        {run.state.identity?.mode === "not_found" ? `No public profile found for ${run.input.name}. ` : ""}Nothing specific to this person could be verified, so the draft falls back to team or company signals and stays short. It
        doesn&apos;t pretend to know them.
      </p>
      {a.length > 0 && (
        <>
          <p className="label mt-4 mb-2">Other people at {run.state.target.company} who may have more public signal</p>
          <div className="flex flex-wrap gap-2">
            {a.map((c, i) => (
              <a key={i} href={c.url} target="_blank" rel="noreferrer" className="rounded-lg border border-line px-3 py-2 text-sm hover:border-ink">
                <span className="font-medium">{c.name}</span> <span className="text-muted">· {c.title}</span>
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
