"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BranchBadge, ConfidencePill, secs, StatusPill } from "@/components/ui";
import type { Run, SellerProfile } from "@/lib/types";

const SAMPLE = `name,company,title,expected
Priya Menon,Finlark,VP Finance Operations,ready
Dev Malhotra,Finlark,Head of Procurement,ready
Rahul Sharma,Nimbus Systems,,pause
Arjun Rao,Quillbyte,Procurement Manager,pivot
Meera Iyer,Tessaract Retail,"Director, Finance",hold
Kavya Nair,Banyan Foods,Finance Manager,degrade`;

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      cur.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(cell);
      if (cur.some((c) => c.trim())) rows.push(cur);
      cur = [];
      cell = "";
    } else cell += ch;
  }
  cur.push(cell);
  if (cur.some((c) => c.trim())) rows.push(cur);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] || "").trim()])));
}

export default function Batch() {
  const [csv, setCsv] = useState("");
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [sellerId, setSellerId] = useState("ai-ops");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [running, setRunning] = useState(false);
  const [mock, setMock] = useState(false);
  const started = useRef(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    fetch("/api/sellers").then((r) => r.json()).then((j) => setSellers(j.sellers));
    fetch("/api/health").then((r) => r.json()).then((h) => setMock(h.mock));
  }, []);

  useEffect(() => {
    if (!batchId) return;
    const load = () =>
      fetch("/api/runs")
        .then((r) => r.json())
        .then((j) => setRuns(j.runs.filter((r: Run) => r.input.batchId === batchId)));
    load();
    const t = setInterval(() => {
      load();
      if (running) setElapsed(Date.now() - started.current);
    }, 1000);
    return () => clearInterval(t);
  }, [batchId, running]);

  const rows = parseCsv(csv);

  const start = async () => {
    setRunning(true);
    started.current = Date.now();
    const r = await fetch("/api/batches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ rows, sellerId }) });
    const j = await r.json();
    setBatchId(j.batchId);
    // Same-company prospects run one after another (so the collision check can see the earlier hook);
    // different companies run 3 at a time.
    const byCompany = new Map<string, string[]>();
    j.ids.forEach((id: string, i: number) => {
      const c = (rows[i]?.company || id).toLowerCase();
      byCompany.set(c, [...(byCompany.get(c) || []), id]);
    });
    const groups = [...byCompany.values()];
    const worker = async () => {
      while (groups.length) {
        const g = groups.shift()!;
        for (const id of g) await fetch(`/api/runs/${id}/stream`).then((res) => res.text()).catch(() => {});
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    setElapsed(Date.now() - started.current);
    setRunning(false);
  };

  const onFile = async (f?: File) => f && setCsv(await f.text());
  const done = runs.filter((r) => !["queued", "running"].includes(r.status)).length;
  const order = { paused: 0, awaiting_review: 1, hold: 2, failed: 3, approved: 4, rejected: 5, running: 6, queued: 7 } as Record<string, number>;
  const sorted = [...runs].sort((a, b) => order[a.status] - order[b.status] || ({ LOW: 0, MEDIUM: 1, HIGH: 2 }[a.state.confidence || "LOW"] - { LOW: 0, MEDIUM: 1, HIGH: 2 }[b.state.confidence || "LOW"]));
  const evals = runs.filter((r) => r.input.expected && !["queued", "running"].includes(r.status));
  const outcome = (r: Run) => (r.status === "hold" ? "hold" : r.branches.includes("pause") ? "pause" : r.branches.includes("pivot") ? "pivot" : r.branches.includes("degrade") ? "degrade" : ["awaiting_review", "approved", "rejected"].includes(r.status) ? "ready" : r.status);

  return (
    <div className="space-y-6">
      <div>
        <p className="label">The 200-prospect problem</p>
        <h1 className="text-2xl font-semibold tracking-tight">Batch run</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">Upload a list and the process runs every prospect. You get a review queue sorted by what needs your attention first. Add an <code className="font-mono text-xs">expected</code> column to use the list as a test set.</p>
      </div>

      {!batchId && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="btn cursor-pointer">
              Upload CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            </label>
            {mock && (
              <button className="btn" onClick={() => setCsv(SAMPLE)}>
                Load sample test set
              </button>
            )}
            <span className="text-xs text-muted">Columns: name, company, title, linkedin_url, expected (ready | pause | pivot | hold | degrade)</span>
          </div>
          <textarea className="input h-44 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="name,company,title&#10;Jane Doe,Acme Corp,CFO" />
          <div className="flex items-end gap-3">
            <div className="w-96">
              <label className="label">Selling</label>
              <select className="input mt-1.5" value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary h-[40px]" disabled={!rows.length || running} onClick={start}>
              Run {rows.length || ""} prospect{rows.length === 1 ? "" : "s"} →
            </button>
          </div>
        </div>
      )}

      {batchId && (
        <div className="card p-5">
          <div className="flex items-center gap-4 mb-4">
            <div>
              <p className="label">Batch {batchId}</p>
              <p className="text-lg font-semibold">
                {done}/{runs.length} done <span className="text-muted font-normal text-sm">· {secs(elapsed)}</span>
              </p>
            </div>
            <div className="flex-1 h-2 rounded-full bg-line overflow-hidden">
              <div className="h-full bg-good transition-all" style={{ width: `${runs.length ? (done / runs.length) * 100 : 0}%` }} />
            </div>
            {evals.length > 0 && !running && (
              <span className="text-sm px-3 py-1.5 rounded-lg bg-accent-soft font-medium">
                Test set: {evals.filter((r) => outcome(r) === r.input.expected).length}/{evals.length} as expected
              </span>
            )}
            {!running && (
              <button className="btn" onClick={() => (setBatchId(null), setRuns([]), setCsv(""))}>
                New batch
              </button>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted border-b border-line">
                <th className="py-2">Prospect</th>
                <th>Status</th>
                <th>Behaviour</th>
                <th>Confidence</th>
                {evals.length > 0 && <th>Expected</th>}
                <th className="text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-2.5">
                    <Link href={`/runs/${r.id}`} className="font-medium hover:text-accent">
                      {r.state.target.name}
                    </Link>
                    <span className="text-muted"> · {r.state.target.company}</span>
                  </td>
                  <td>
                    <StatusPill status={r.status} />
                  </td>
                  <td>
                    <div className="flex gap-1 flex-wrap">
                      {r.branches.map((b) => (
                        <BranchBadge key={b} b={b} />
                      ))}
                    </div>
                  </td>
                  <td>
                    <ConfidencePill c={r.state.confidence} />
                  </td>
                  {evals.length > 0 && (
                    <td className="text-xs">
                      {r.input.expected ? (
                        <span className={outcome(r) === r.input.expected ? "text-good" : ["queued", "running"].includes(r.status) ? "text-muted" : "text-bad"}>
                          {r.input.expected} {["queued", "running"].includes(r.status) ? "" : outcome(r) === r.input.expected ? "✓" : `✗ (${outcome(r)})`}
                        </span>
                      ) : null}
                    </td>
                  )}
                  <td className="text-right font-mono text-xs">{secs(r.metrics.ms)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
