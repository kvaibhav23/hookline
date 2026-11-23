"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { StatusPill } from "@/components/ui";
import type { Run, SellerProfile } from "@/lib/types";

const SAMPLES = [
  { tag: "Happy path", name: "Priya Menon", company: "Finlark", title: "VP Finance Operations", note: "Strong person-level signal" },
  { tag: "⏸ Pause", name: "Rahul Sharma", company: "Nimbus Systems", title: "", note: "3 people share the name" },
  { tag: "↪ Pivot", name: "Arjun Rao", company: "Quillbyte", title: "Procurement Manager", note: "Moved companies recently" },
  { tag: "✋ Hold", name: "Meera Iyer", company: "Tessaract Retail", title: "Director, Finance", note: "Layoffs announced last week" },
  { tag: "⤓ Degrade", name: "Kavya Nair", company: "Banyan Foods", title: "Finance Manager", note: "No public footprint" },
];

export default function NewRun() {
  const router = useRouter();
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [recent, setRecent] = useState<Run[]>([]);
  const [mock, setMock] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ name: "", company: "", title: "", linkedinUrl: "", pastedContext: "", sellerId: "ai-ops" });

  useEffect(() => {
    fetch("/api/sellers").then((r) => r.json()).then((j) => setSellers(j.sellers));
    fetch("/api/runs").then((r) => r.json()).then((j) => setRecent(j.runs.slice(0, 6)));
    fetch("/api/health").then((r) => r.json()).then((h) => setMock(h.mock));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const j = await r.json();
    if (!r.ok) {
      setErr(j.error || "Failed");
      setBusy(false);
      return;
    }
    router.push(`/runs/${j.id}`);
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-8">
      <div>
        <p className="label mb-2">Prospect → researched, verified draft</p>
        <h1 className="text-3xl font-semibold tracking-tight max-w-xl leading-tight">Name a prospect. Get a draft worth reviewing, with a source for every claim.</h1>
        <p className="text-muted mt-3 max-w-xl">
          Hookline researches the person and company, picks the most relevant hook for what you sell and writes a short email. It checks every fact against its source. It also knows when <em>not</em> to send. A human approves everything.
        </p>

        <form onSubmit={submit} className="card p-6 mt-8 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Prospect name *</label>
              <input className="input mt-1.5" value={f.name} onChange={set("name")} placeholder="e.g. Priya Menon" required />
            </div>
            <div>
              <label className="label">Company *</label>
              <input className="input mt-1.5" value={f.company} onChange={set("company")} placeholder="e.g. Finlark" required />
            </div>
            <div>
              <label className="label">Title (optional)</label>
              <input className="input mt-1.5" value={f.title} onChange={set("title")} placeholder="Helps pick the right person" />
            </div>
            <div>
              <label className="label">Profile URL (optional)</label>
              <input className="input mt-1.5" value={f.linkedinUrl} onChange={set("linkedinUrl")} placeholder="Skips identity matching" />
            </div>
          </div>
          <div>
            <label className="label">Anything you already know (optional)</label>
            <textarea className="input mt-1.5 h-20" value={f.pastedContext} onChange={set("pastedContext")} placeholder="Paste a recent post, a note from a call… treated as a source, cited like any other." />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="label">What are we selling?</label>
              <select className="input mt-1.5" value={f.sellerId} onChange={set("sellerId")}>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary h-[40px] px-6" disabled={busy}>
              {busy ? "Starting…" : "Research & draft →"}
            </button>
          </div>
          {err && <p className="text-bad text-sm">{err}</p>}
        </form>
      </div>

      <aside className="space-y-6">
        <div className="card p-5">
          <p className="label mb-3">{mock ? "Sample prospects (mock data)" : "Edge-case scenarios to try"}</p>
          {!mock && <p className="text-xs text-muted mb-3">These are fictional and only resolve in mock mode. In live mode, use real names, e.g. someone in this week&apos;s layoff news to trigger Hold.</p>}
          <div className="space-y-2">
            {SAMPLES.map((s) => (
              <button key={s.name} type="button" onClick={() => setF({ ...f, name: s.name, company: s.company, title: s.title })} className="w-full text-left px-3 py-2.5 rounded-lg border border-line hover:border-ink transition bg-white">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {s.name} · <span className="text-muted">{s.company}</span>
                  </span>
                  <span className="text-xs text-muted">{s.tag}</span>
                </div>
                <p className="text-xs text-muted mt-0.5">{s.note}</p>
              </button>
            ))}
          </div>
        </div>
        {recent.length > 0 && (
          <div className="card p-5">
            <div className="flex items-center mb-3">
              <p className="label">Recent runs</p>
              <Link href="/dashboard" className="ml-auto text-xs text-accent">
                All →
              </Link>
            </div>
            <div className="space-y-1">
              {recent.map((r) => (
                <Link key={r.id} href={`/runs/${r.id}`} className="flex items-center justify-between py-1.5 text-sm hover:text-accent">
                  <span className="truncate">
                    {r.input.name} <span className="text-muted">· {r.state.target?.company || r.input.company}</span>
                  </span>
                  <StatusPill status={r.status} />
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
