"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BranchBadge, ConfidencePill, money, secs, StatusPill } from "@/components/ui";
import type { Run, RunStatus } from "@/lib/types";

const DRAFTED: RunStatus[] = ["awaiting_review", "approved", "rejected"];
const CONF_RANK = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;

function evalOutcome(r: Run): string {
  if (r.status === "hold") return "hold";
  if (r.branches.includes("pause") || r.status === "paused") return "pause";
  if (r.branches.includes("pivot")) return "pivot";
  if (r.branches.includes("degrade")) return "degrade";
  if (DRAFTED.includes(r.status)) return "ready";
  return r.status;
}

export default function Dashboard() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [filter, setFilter] = useState<"all" | RunStatus>("all");

  useEffect(() => {
    const load = () => fetch("/api/runs").then((r) => r.json()).then((j) => setRuns(j.runs));
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, []);

  const k = useMemo(() => {
    const finished = runs.filter((r) => r.metrics.ms && r.status !== "running" && r.status !== "queued");
    const drafted = runs.filter((r) => DRAFTED.includes(r.status));
    const approved = runs.filter((r) => r.status === "approved");
    const rejected = runs.filter((r) => r.status === "rejected");
    const sendReady = approved.filter((r) => (r.review?.editRatio ?? 1) < 0.1);
    const totalMs = finished.reduce((a, r) => a + (r.metrics.ms || 0), 0);
    const totalCost = finished.reduce((a, r) => a + r.metrics.costUsd + r.metrics.searchCostUsd, 0);
    const caught = runs.reduce((a, r) => a + (r.state.claimsCaught?.length || 0), 0);
    const laneAgg: Record<string, { hit: number; n: number }> = {};
    for (const r of finished)
      for (const l of r.state.laneStats) {
        laneAgg[l.lane] ||= { hit: 0, n: 0 };
        laneAgg[l.lane].n++;
        if (l.ok && l.count > 0) laneAgg[l.lane].hit++;
      }
    const hookTypes: Record<string, number> = {};
    for (const r of drafted) {
      const w = r.state.hooks?.find((h) => h.id === r.state.winnerId);
      const s = r.state.signals.find((x) => x.id === w?.signalIds[0]);
      const key = s ? `${s.scope} · ${s.type.replace("_", " ")}` : "role-based (no signal)";
      hookTypes[key] = (hookTypes[key] || 0) + 1;
    }
    const outcomes: Record<string, number> = {};
    for (const r of runs) outcomes[evalOutcome(r)] = (outcomes[evalOutcome(r)] || 0) + 1;
    const evals = runs.filter((r) => r.input.expected && TERMINAL_OK(r));
    const evalPass = evals.filter((r) => evalOutcome(r) === r.input.expected!.toLowerCase().trim());
    const conf = { HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const r of drafted) if (r.state.confidence) conf[r.state.confidence]++;
    return { finished, drafted, approved, rejected, sendReady, totalMs, totalCost, caught, laneAgg, hookTypes, outcomes, evals, evalPass, conf };
  }, [runs]);

  const queue = runs
    .filter((r) => r.status === "paused" || r.status === "awaiting_review")
    .sort((a, b) => (a.status === "paused" ? -1 : b.status === "paused" ? 1 : CONF_RANK[a.state.confidence || "LOW"] - CONF_RANK[b.state.confidence || "LOW"]));

  const hoursSaved = Math.max(0, (k.drafted.length + runs.filter((r) => r.status === "hold").length) * 20 * 60_000 - k.totalMs) / 3.6e6;
  const tiles = [
    { label: "Runs", value: String(runs.length), sub: `${k.drafted.length} drafts · ${runs.filter((r) => r.status === "hold").length} holds` },
    { label: "Avg time / prospect", value: secs(k.finished.length ? Math.round(k.totalMs / k.finished.length) : undefined), sub: "vs ~20 min manual" },
    { label: "Avg cost / prospect", value: k.finished.length ? money(k.totalCost / k.finished.length) : "—", sub: "LLM + search, estimated" },
    { label: "Research hours saved", value: hoursSaved.toFixed(1), sub: "at 20 min per prospect" },
    { label: "Approved with < 10% edits", value: k.approved.length ? `${Math.round((k.sendReady.length / k.approved.length) * 100)}%` : "—", sub: `${k.approved.length} approved · ${k.rejected.length} rejected` },
    { label: "Unsupported claims caught", value: String(k.caught), sub: "removed before a human saw them" },
  ];

  const shown = filter === "all" ? runs : runs.filter((r) => r.status === filter);
  const maxHook = Math.max(1, ...Object.values(k.hookTypes));

  return (
    <div className="space-y-6">
      <div className="flex items-end">
        <div>
          <p className="label">Across all runs</p>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        </div>
        <Link href="/batch" className="btn ml-auto">
          Run a batch →
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-[11px] text-muted">{t.label}</p>
            <p className="text-2xl font-semibold font-mono mt-1">{t.value}</p>
            <p className="text-[11px] text-muted mt-0.5">{t.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
        <section className="card p-5">
          <div className="flex items-baseline mb-3">
            <h2 className="font-semibold">Review queue</h2>
            <p className="text-sm text-muted ml-3">Paused first, then lowest confidence, so attention goes where it&apos;s needed.</p>
          </div>
          {queue.length === 0 ? (
            <p className="text-sm text-muted">Nothing waiting. 🎉</p>
          ) : (
            <ul className="divide-y divide-line">
              {queue.slice(0, 10).map((r) => (
                <li key={r.id}>
                  <Link href={`/runs/${r.id}`} className="flex items-center gap-3 py-2.5 hover:text-accent">
                    <span className="text-sm font-medium truncate">{r.state.target.name}</span>
                    <span className="text-sm text-muted truncate">{r.state.target.company}</span>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {r.status === "paused" ? <StatusPill status="paused" /> : <ConfidencePill c={r.state.confidence} />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 space-y-5">
          <div>
            <h2 className="font-semibold mb-3">Outcomes</h2>
            <div className="flex h-3 rounded-full overflow-hidden bg-line">
              {[
                ["ready", "bg-good"],
                ["pivot", "bg-accent"],
                ["degrade", "bg-muted"],
                ["pause", "bg-info"],
                ["hold", "bg-warn"],
                ["failed", "bg-bad"],
              ].map(([key, cls]) => (k.outcomes[key] ? <div key={key} className={cls} style={{ width: `${(k.outcomes[key] / runs.length) * 100}%` }} title={`${key}: ${k.outcomes[key]}`} /> : null))}
            </div>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted">
              {Object.entries(k.outcomes).map(([key, n]) => (
                <span key={key}>
                  {key} <b className="text-ink">{n}</b>
                </span>
              ))}
            </div>
          </div>
          <div>
            <h2 className="font-semibold mb-2">Draft confidence</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((c) => (
                <div key={c} className="rounded-lg bg-paper p-2">
                  <p className="font-mono text-lg">{k.conf[c]}</p>
                  <p className="text-[11px] text-muted">{c}</p>
                </div>
              ))}
            </div>
          </div>
          {k.evals.length > 0 && (
            <div className="rounded-lg bg-accent-soft p-3">
              <p className="text-sm font-semibold">
                Test set: {k.evalPass.length}/{k.evals.length} behaved as expected
              </p>
              <p className="text-xs text-muted">Runs with an expected outcome (from the batch CSV) compared to what the process actually did.</p>
            </div>
          )}
        </section>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="card p-5">
          <h2 className="font-semibold">What hooks are winning</h2>
          <p className="text-sm text-muted mb-3">Signal type behind each draft</p>
          <div className="space-y-2">
            {Object.entries(k.hookTypes)
              .sort((a, b) => b[1] - a[1])
              .map(([t, n]) => (
                <div key={t} className="grid grid-cols-[180px_1fr_24px] items-center gap-3 text-sm">
                  <span className="truncate">{t}</span>
                  <Bar value={n} max={maxHook} />
                  <span className="font-mono text-xs">{n}</span>
                </div>
              ))}
            {!Object.keys(k.hookTypes).length && <p className="text-sm text-muted">No drafts yet.</p>}
          </div>
        </section>
        <section className="card p-5">
          <h2 className="font-semibold">Where signal comes from</h2>
          <p className="text-sm text-muted mb-3">Share of runs where each research lane found something</p>
          <div className="space-y-2">
            {Object.entries(k.laneAgg).map(([lane, v]) => (
              <div key={lane} className="grid grid-cols-[90px_1fr_44px] items-center gap-3 text-sm">
                <span>{lane}</span>
                <Bar value={v.hit} max={v.n} tone="good" />
                <span className="font-mono text-xs">{Math.round((v.hit / v.n) * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="card p-5">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="font-semibold mr-3">History</h2>
          {(["all", "awaiting_review", "paused", "hold", "approved", "rejected", "failed"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`text-xs px-2.5 py-1 rounded-md ${filter === f ? "bg-ink text-white" : "text-muted hover:bg-paper"}`}>
              {f === "all" ? "All" : f.replace("_", " ")}
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="py-2 pr-3">When</th>
                <th className="pr-3">Prospect</th>
                <th className="pr-3">Status</th>
                <th className="pr-3">Behaviour</th>
                <th className="pr-3">Hook / reason</th>
                <th className="pr-3">Conf.</th>
                <th className="pr-3 text-right">Time</th>
                <th className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const w = r.state.hooks?.find((h) => h.id === r.state.winnerId);
                return (
                  <tr key={r.id} className="border-b border-line/60 hover:bg-paper/60">
                    <td className="py-2.5 pr-3 text-xs text-muted whitespace-nowrap">{new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                    <td className="pr-3">
                      <Link href={`/runs/${r.id}`} className="font-medium hover:text-accent">
                        {r.state.target.name}
                      </Link>
                      <span className="text-muted"> · {r.state.target.company}</span>
                      {r.mock && <span className="ml-1 text-[10px] text-warn">mock</span>}
                    </td>
                    <td className="pr-3">
                      <StatusPill status={r.status} />
                    </td>
                    <td className="pr-3">
                      <div className="flex gap-1 flex-wrap">
                        {r.branches.map((b) => (
                          <BranchBadge key={b} b={b} />
                        ))}
                      </div>
                    </td>
                    <td className="pr-3 text-xs text-muted max-w-[280px] truncate">{r.status === "hold" ? r.state.gate?.reasons[0] : w?.angle || r.error || ""}</td>
                    <td className="pr-3">{r.state.confidence && <span className="text-xs font-mono">{r.state.confidence}</span>}</td>
                    <td className="pr-3 text-right font-mono text-xs">{secs(r.metrics.ms)}</td>
                    <td className="text-right font-mono text-xs">{money(r.metrics.costUsd + r.metrics.searchCostUsd)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!shown.length && <p className="text-sm text-muted py-6 text-center">No runs yet.</p>}
        </div>
      </section>
    </div>
  );
}

function TERMINAL_OK(r: Run) {
  return !["queued", "running"].includes(r.status);
}
