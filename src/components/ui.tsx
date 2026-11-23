import type { Branch, Confidence, RunStatus } from "@/lib/types";

export const STATUS_STYLE: Record<RunStatus, { label: string; cls: string }> = {
  queued: { label: "Queued", cls: "bg-line text-muted" },
  running: { label: "Running", cls: "bg-accent-soft text-accent" },
  paused: { label: "Needs rep input", cls: "bg-info-soft text-info" },
  awaiting_review: { label: "Ready for review", cls: "bg-good-soft text-good" },
  hold: { label: "Hold — don't send", cls: "bg-warn-soft text-warn" },
  approved: { label: "Approved", cls: "bg-good text-white" },
  rejected: { label: "Rejected", cls: "bg-bad-soft text-bad" },
  failed: { label: "Failed", cls: "bg-bad-soft text-bad" },
};

export function StatusPill({ status }: { status: RunStatus }) {
  const s = STATUS_STYLE[status];
  return <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium ${s.cls}`}>{status === "running" && <span className="w-1.5 h-1.5 rounded-full bg-accent pulse" />}{s.label}</span>;
}

const BRANCH: Record<Branch, { label: string; cls: string; tip: string }> = {
  pause: { label: "⏸ Pause", cls: "border-info text-info", tip: "Ambiguous identity — asked the rep" },
  pivot: { label: "↪ Pivot", cls: "border-accent text-accent", tip: "Person changed company — re-targeted" },
  hold: { label: "✋ Hold", cls: "border-warn text-warn", tip: "Sensitive moment — told the rep not to send" },
  degrade: { label: "⤓ Degrade", cls: "border-muted text-muted", tip: "Thin public signal — fell back down the ladder" },
  revised: { label: "✎ Self-corrected", cls: "border-bad text-bad", tip: "Verifier caught an unsupported claim and forced a rewrite" },
  "collision-avoided": { label: "⇄ Collision avoided", cls: "border-info text-info", tip: "Colleague at same account already got this hook" },
};

export function BranchBadge({ b }: { b: Branch }) {
  const s = BRANCH[b];
  return (
    <span title={s.tip} className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs font-medium bg-white ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function ConfidencePill({ c }: { c?: Confidence }) {
  if (!c) return null;
  const cls = c === "HIGH" ? "bg-good-soft text-good" : c === "MEDIUM" ? "bg-info-soft text-info" : "bg-warn-soft text-warn";
  return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{c} confidence</span>;
}

export function Bar({ value, max = 1, tone = "accent" }: { value: number; max?: number; tone?: "accent" | "good" | "warn" | "muted" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", muted: "bg-muted" }[tone];
  return (
    <div className="h-1.5 w-full rounded-full bg-line overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card p-5 rise">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-sm text-muted">{hint}</p>}
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

export const ago = (iso?: string) => {
  if (!iso) return "undated";
  const d = Math.round((Date.now() - Date.parse(iso)) / 864e5);
  if (Number.isNaN(d)) return "undated";
  return d <= 0 ? "today" : d === 1 ? "1 day ago" : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`;
};

export const money = (x: number) => (x < 0.01 ? `$${x.toFixed(4)}` : `$${x.toFixed(3)}`);
export const secs = (ms?: number) => (ms === undefined ? "—" : ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
