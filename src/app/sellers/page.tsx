"use client";
import { useEffect, useState } from "react";
import type { SellerProfile } from "@/lib/types";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export default function Sellers() {
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [sel, setSel] = useState<SellerProfile | null>(null);
  const [saved, setSaved] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = () =>
    fetch("/api/sellers")
      .then((r) => r.json())
      .then((j) => {
        setSellers(j.sellers);
        setSel((cur) => j.sellers.find((s: SellerProfile) => s.id === cur?.id) || j.sellers[0]);
      });
  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!sel) return;
    await fetch("/api/sellers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(sel) });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
    load();
  };

  const fromUrl = async () => {
    setBusy(true);
    setErr("");
    const r = await fetch("/api/sellers/from-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) return setErr(j.error);
    setSel(j.seller);
    setSellers((s) => [...s, j.seller]);
  };

  const up = (p: Partial<SellerProfile>) => sel && setSel({ ...sel, ...p });

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6">
      <aside className="space-y-3">
        <p className="label">Seller profiles</p>
        <p className="text-xs text-muted">The hook has to connect the prospect&apos;s situation to something you actually sell. That&apos;s what these profiles are for.</p>
        {sellers.map((s) => (
          <button key={s.id} onClick={() => setSel(s)} className={`w-full text-left rounded-lg border p-3 text-sm ${sel?.id === s.id ? "border-ink bg-white" : "border-line hover:bg-white"}`}>
            {s.name}
          </button>
        ))}
        <div className="card p-3 space-y-2">
          <p className="text-xs font-medium">Build one from a website</p>
          <input className="input !text-xs" placeholder="https://company.com" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn w-full justify-center !text-xs" disabled={!url || busy} onClick={fromUrl}>
            {busy ? "Reading site…" : "Generate profile"}
          </button>
          {err && <p className="text-xs text-bad">{err}</p>}
        </div>
      </aside>

      {sel && (
        <div className="card p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Company name</label>
              <input className="input mt-1.5" value={sel.name} onChange={(e) => up({ name: e.target.value })} />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input mt-1.5" value={sel.website || ""} onChange={(e) => up({ website: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">One-liner</label>
            <textarea className="input mt-1.5 h-16" value={sel.oneLiner} onChange={(e) => up({ oneLiner: e.target.value })} />
          </div>
          <div>
            <div className="flex items-center">
              <label className="label">Value props</label>
              <button className="ml-auto text-xs text-accent" onClick={() => up({ valueProps: [...sel.valueProps, { id: `V${sel.valueProps.length + 1}`, title: "", description: "" }] })}>
                + add
              </button>
            </div>
            <div className="space-y-2 mt-1.5">
              {sel.valueProps.map((v, i) => (
                <div key={v.id} className="grid grid-cols-[40px_220px_1fr_24px] gap-2 items-start">
                  <span className="font-mono text-xs text-muted pt-2.5">{v.id}</span>
                  <input className="input" value={v.title} placeholder="Title" onChange={(e) => up({ valueProps: sel.valueProps.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input className="input" value={v.description} placeholder="Concrete outcome" onChange={(e) => up({ valueProps: sel.valueProps.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)) })} />
                  <button className="text-muted pt-2" onClick={() => up({ valueProps: sel.valueProps.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center">
              <label className="label">Proof points (only real ones)</label>
              <button className="ml-auto text-xs text-accent" onClick={() => up({ proofPoints: [...sel.proofPoints, { id: `P${sel.proofPoints.length + 1}`, text: "" }] })}>
                + add
              </button>
            </div>
            <div className="space-y-2 mt-1.5">
              {sel.proofPoints.map((p, i) => (
                <div key={p.id} className="grid grid-cols-[40px_1fr_24px] gap-2">
                  <span className="font-mono text-xs text-muted pt-2.5">{p.id}</span>
                  <input className="input" value={p.text} onChange={(e) => up({ proofPoints: sel.proofPoints.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
                  <button className="text-muted" onClick={() => up({ proofPoints: sel.proofPoints.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Existing customers (comma-separated): never cold-pitch these</label>
              <input className="input mt-1.5" value={sel.customers.join(", ")} onChange={(e) => up({ customers: list(e.target.value) })} />
            </div>
            <div>
              <label className="label">Competitors: never contact these</label>
              <input className="input mt-1.5" value={sel.competitors.join(", ")} onChange={(e) => up({ competitors: list(e.target.value) })} />
            </div>
            <div>
              <label className="label">Sender name</label>
              <input className="input mt-1.5" value={sel.senderName} onChange={(e) => up({ senderName: e.target.value })} />
            </div>
            <div>
              <label className="label">Sender title</label>
              <input className="input mt-1.5" value={sel.senderTitle} onChange={(e) => up({ senderTitle: e.target.value })} />
            </div>
            <div>
              <label className="label">Call to action</label>
              <input className="input mt-1.5" value={sel.cta} onChange={(e) => up({ cta: e.target.value })} />
            </div>
            <div>
              <label className="label">Tone</label>
              <input className="input mt-1.5" value={sel.tone} onChange={(e) => up({ tone: e.target.value })} />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-primary" onClick={save}>
              Save profile
            </button>
            {saved && <span className="text-sm text-good">Saved ✓</span>}
          </div>
        </div>
      )}
    </div>
  );
}
