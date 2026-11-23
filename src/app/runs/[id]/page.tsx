"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { DraftReview } from "@/components/DraftReview";
import { AlternatesCard, HoldCard, IdentityPicker, PivotCard } from "@/components/DecisionCards";
import { HookTournament, SignalsBoard, SourcesAndCost, StageTimeline, Verification } from "@/components/RunPanels";
import { BranchBadge, secs, StatusPill } from "@/components/ui";
import { TERMINAL, type Run, type RunEvent, type SellerProfile } from "@/lib/types";

export default function RunPage() {
  return (
    <Suspense fallback={<p className="text-muted">Loading…</p>}>
      <RunView />
    </Suspense>
  );
}

function RunView() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [streamKey, setStreamKey] = useState(0);
  const [sellers, setSellers] = useState<SellerProfile[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const t0 = useRef<number>(0);

  const refresh = useCallback(async () => {
    const r = await fetch(`/api/runs/${id}`);
    if (!r.ok) return;
    const j = await r.json();
    setRun(j.run);
    setEvents(j.events);
  }, [id]);

  useEffect(() => {
    fetch("/api/sellers").then((r) => r.json()).then((j) => setSellers(j.sellers));
  }, []);

  // Live stream: executes the run if queued, otherwise tails it.
  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
      t0.current = Date.now();
      es = new EventSource(`/api/runs/${id}/stream`);
      es.addEventListener("event", (m) => {
        const e = JSON.parse((m as MessageEvent).data) as RunEvent;
        setEvents((prev) => (prev.some((p) => p.seq === e.seq) ? prev : [...prev, e]));
        if (["done", "pause", "hold", "error"].includes(e.status)) refresh();
      });
      es.addEventListener("end", () => {
        es?.close();
        refresh();
      });
      es.onerror = () => {
        es?.close();
        refresh();
      };
    })();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, [id, streamKey, refresh]);

  const live = run && !TERMINAL.includes(run.status);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setElapsed(Date.now() - t0.current), 200);
    return () => clearInterval(t);
  }, [live]);

  const rerun = async (sellerId?: string) => {
    const r = await fetch(`/api/runs/${id}/rerun`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sellerId }) });
    const j = await r.json();
    router.push(`/runs/${j.id}`);
  };

  if (!run) return <p className="text-muted">Loading…</p>;
  const st = run.state;

  return (
    <div>
      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div>
          <Link href="/" className="text-xs text-muted hover:text-ink">
            ← New run
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight mt-1">
            {st.target.name}
            <span className="text-muted font-normal">
              {" "}
              · {st.target.title ? `${st.target.title}, ` : ""}
              {st.target.company}
            </span>
          </h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <StatusPill status={run.status} />
            {run.branches.map((b) => (
              <BranchBadge key={b} b={b} />
            ))}
            {run.mock && <span className="text-xs px-2 py-0.5 rounded-md bg-warn-soft text-warn font-medium">MOCK DATA</span>}
            <span className="text-xs text-muted">Selling: {run.seller.name}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-sm text-muted">{live ? secs(elapsed) : secs(run.metrics.ms)}</span>
          {!live && (
            <>
              <select className="input !w-auto !py-1.5 text-sm" defaultValue="" onChange={(e) => e.target.value && rerun(e.target.value)}>
                <option value="">Re-run as another seller…</option>
                {sellers
                  .filter((s) => s.id !== run.seller.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
              <button className="btn !py-1.5" onClick={() => rerun()}>
                ↻ Re-run
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start">
        <aside className="card p-5 lg:sticky lg:top-20">
          <p className="label mb-4">Live run</p>
          <StageTimeline run={run} events={events} />
        </aside>

        <div className="space-y-5 min-w-0">
          {run.status === "failed" && (
            <div className="card p-5 border-bad" style={{ borderColor: "var(--color-bad)" }}>
              <p className="label !text-bad">Run failed</p>
              <p className="text-sm mt-1 font-mono">{run.error}</p>
              <button className="btn mt-3" onClick={() => rerun()}>
                ↻ Retry
              </button>
            </div>
          )}
          {run.status === "paused" && <IdentityPicker run={run} onResumed={() => setStreamKey((k) => k + 1)} />}
          {run.status === "hold" && st.gate && <HoldCard run={run} />}
          {st.pivot && <PivotCard run={run} />}
          {st.draft && TERMINAL.includes(run.status) && <DraftReview key={`${run.id}-${run.review?.at || ""}`} run={run} onChanged={refresh} />}
          {run.branches.includes("degrade") && st.hooks && <AlternatesCard run={run} />}
          {live && !st.signals.length && (
            <div className="card p-10 text-center text-muted">
              <p className="pulse">Researching {st.target.name}…</p>
              <p className="text-xs mt-1">Each stage appears on the left as it runs.</p>
            </div>
          )}
          {st.hooks && <HookTournament run={run} />}
          {st.claimChecks && <Verification run={run} />}
          {st.signals.length > 0 && <SignalsBoard run={run} />}
          {st.sources.length > 0 && <SourcesAndCost run={run} />}
        </div>
      </div>
    </div>
  );
}
