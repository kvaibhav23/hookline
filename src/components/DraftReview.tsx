"use client";
import { Fragment, useMemo, useState } from "react";
import type { Run } from "@/lib/types";
import { ConfidenceLine } from "./RunPanels";
import { Section } from "./ui";

/** Render body with each sourced claim highlighted + a footnote to its source. */
function WithReceipts({ run, text }: { run: Run; text: string }) {
  const st = run.state;
  const parts = useMemo(() => {
    const marks: { start: number; end: number; sid: string }[] = [];
    const low = text.toLowerCase();
    for (const c of st.draft?.claims || []) {
      const needle = c.text.toLowerCase().replace(/\.$/, "");
      const at = low.indexOf(needle);
      if (at >= 0 && needle.length > 6 && !marks.some((m) => at < m.end && at + needle.length > m.start)) marks.push({ start: at, end: at + needle.length, sid: c.signalId });
    }
    marks.sort((a, b) => a.start - b.start);
    const out: { t: string; sid?: string }[] = [];
    let i = 0;
    for (const m of marks) {
      out.push({ t: text.slice(i, m.start) });
      out.push({ t: text.slice(m.start, m.end), sid: m.sid });
      i = m.end;
    }
    out.push({ t: text.slice(i) });
    return out;
  }, [text, st.draft]);

  return (
    <div className="whitespace-pre-wrap text-[15px] leading-relaxed">
      {parts.map((p, i) => {
        if (!p.sid) return <Fragment key={i}>{p.t}</Fragment>;
        const sig = st.signals.find((s) => s.id === p.sid);
        const src = st.sources.find((s) => s.id === sig?.sourceId);
        return (
          <Fragment key={i}>
            <mark className="claim" title={sig ? `"${sig.evidence}"\n— ${src?.title} (${sig.date || "undated"})` : "unsupported"}>
              {p.t}
            </mark>
            {src && (
              <a href={src.url.startsWith("rep://") ? undefined : src.url} target="_blank" rel="noreferrer" className="align-super text-[10px] font-mono text-good ml-0.5">
                [{src.id}]
              </a>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export function DraftReview({ run, onChanged }: { run: Run; onChanged: () => void }) {
  const d = run.state.draft!;
  const [tab, setTab] = useState<"email" | "linkedin">("email");
  const [mode, setMode] = useState<"receipts" | "edit">("receipts");
  const [subject, setSubject] = useState(run.review?.finalSubject ?? d.subject);
  const [body, setBody] = useState(run.review?.finalBody ?? d.body);
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checked, setChecked] = useState(false);

  const reviewed = run.status === "approved" || run.status === "rejected";
  const edited = subject !== d.subject || body !== d.body;
  const unresolved = run.state.unresolvedClaims || [];
  // An unsupported claim the firewall couldn't cut must be consciously handled, never one-click approved.
  const blocked = !reviewed && unresolved.length > 0 && !edited && !checked;

  const act = async (action: "approved" | "rejected") => {
    await fetch(`/api/runs/${run.id}/review`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, subject, body, reason }) });
    if (action === "approved") {
      await navigator.clipboard?.writeText(`Subject: ${subject}\n\n${body}`).catch(() => {});
      setCopied(true);
    }
    onChanged();
  };

  return (
    <Section
      title="Draft for review"
      hint="Nothing is sent automatically."
      right={
        <div className="flex gap-1 text-xs">
          {(["email", "linkedin"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1 rounded-md ${tab === t ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}>
              {t === "email" ? "Email" : "LinkedIn note"}
            </button>
          ))}
        </div>
      }
    >
      <div className="mb-4">
        <ConfidenceLine run={run} />
        {run.state.winnerRationale && <p className="text-xs text-muted mt-1.5">Why this hook: {run.state.winnerRationale}</p>}
      </div>

      {!reviewed && unresolved.length > 0 && (
        <div className="mb-4 rounded-lg bg-bad-soft p-3 text-sm">
          <p className="font-semibold text-bad">
            {unresolved.length === 1 ? "1 claim" : `${unresolved.length} claims`} in this draft could not be verified against any source
          </p>
          <ul className="mt-1 list-disc pl-5">
            {unresolved.map((c, i) => (
              <li key={i}>{c.statement}</li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-1.5">The automatic rewrite didn&apos;t remove it. Edit it out, or confirm you know it&apos;s true.</p>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />I&apos;ve checked these claims myself
          </label>
        </div>
      )}

      {tab === "email" ? (
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line bg-paper text-sm">
            <span className="text-muted w-14">To</span>
            <span>
              {run.state.target.name} · {run.state.target.title ? `${run.state.target.title}, ` : ""}
              {run.state.target.company}
            </span>
            {!reviewed && (
              <div className="ml-auto flex gap-1 text-xs">
                <button onClick={() => setMode("receipts")} className={`px-2 py-0.5 rounded ${mode === "receipts" ? "bg-white border border-line" : "text-muted"}`}>
                  Show sources
                </button>
                <button onClick={() => setMode("edit")} className={`px-2 py-0.5 rounded ${mode === "edit" ? "bg-white border border-line" : "text-muted"}`}>
                  Edit
                </button>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-line text-sm">
            <span className="text-muted w-14">Subject</span>
            {mode === "edit" && !reviewed ? <input className="flex-1 outline-none font-medium" value={subject} onChange={(e) => setSubject(e.target.value)} /> : <span className="font-medium">{subject}</span>}
          </div>
          <div className="p-4 min-h-[180px]">
            {mode === "edit" && !reviewed ? (
              <textarea className="w-full h-64 outline-none text-[15px] leading-relaxed resize-y" value={body} onChange={(e) => setBody(e.target.value)} />
            ) : edited || reviewed ? (
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed">{body}</div>
            ) : (
              <WithReceipts run={run} text={body} />
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-line p-4 text-[15px] leading-relaxed bg-white">
          {d.linkedin}
          <p className="text-xs text-muted mt-3 font-mono">{d.linkedin.length}/300 characters</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!reviewed && (
          <>
            <button className="btn btn-good" disabled={blocked} title={blocked ? "Resolve the unverified claim(s) above first" : undefined} onClick={() => act("approved")}>
              ✓ Approve {edited ? "with edits" : ""} & copy
            </button>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(tab === "email" ? `Subject: ${subject}\n\n${body}` : d.linkedin)}>
              Copy
            </button>
            <a className="btn" href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              Open in mail app
            </a>
            {!rejecting ? (
              <button className="btn ml-auto text-bad" onClick={() => setRejecting(true)}>
                Reject
              </button>
            ) : (
              <div className="ml-auto flex gap-2">
                <input className="input !py-1.5 w-64" placeholder="Why? (helps tune the process)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button className="btn text-bad" onClick={() => act("rejected")}>
                  Confirm reject
                </button>
              </div>
            )}
          </>
        )}
        {run.status === "approved" && (
          <p className="text-sm text-good">
            ✓ Approved{run.review?.editRatio !== undefined ? ` · ${Math.round(run.review.editRatio * 100)}% of words edited` : ""}
            {copied ? " · copied to clipboard" : ""}
          </p>
        )}
        {run.status === "rejected" && <p className="text-sm text-bad">Rejected{run.review?.reason ? `: ${run.review.reason}` : ""}</p>}
      </div>
    </Section>
  );
}
