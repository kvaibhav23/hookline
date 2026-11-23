import { editRatio } from "@/lib/pipeline/util";
import { getStore } from "@/lib/store";

// Human-in-the-loop: nothing leaves the system without this. Edits are diffed and stored
// so the dashboard can track how "send-ready" drafts are over time.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json();
  const store = getStore();
  const run = await store.getRun(id);
  if (!run || run.status !== "awaiting_review" && run.status !== "approved" && run.status !== "rejected")
    return Response.json({ error: "run has no draft to review" }, { status: 409 });
  const d = run.state.draft!;
  if (b.action === "approved") {
    const finalSubject = String(b.subject ?? d.subject);
    const finalBody = String(b.body ?? d.body);
    run.review = { action: "approved", finalSubject, finalBody, editRatio: editRatio(d.subject + " " + d.body, finalSubject + " " + finalBody), at: new Date().toISOString() };
    run.status = "approved";
  } else {
    run.review = { action: "rejected", reason: String(b.reason || "").slice(0, 500), at: new Date().toISOString() };
    run.status = "rejected";
  }
  await store.saveRun(run);
  await store.appendEvent(id, { ts: new Date().toISOString(), stage: "finalize", status: "info", message: run.review.action === "approved" ? `Approved by rep (${Math.round((run.review.editRatio || 0) * 100)}% edited).` : `Rejected by rep: ${run.review.reason || "no reason"}` });
  return Response.json({ ok: true, review: run.review });
}
