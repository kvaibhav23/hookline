import { storageProblem } from "@/lib/config";
import { createRun } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export async function POST(req: Request) {
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const body = await req.json();
  if (!body?.name?.trim() || !body?.company?.trim()) return Response.json({ error: "name and company are required" }, { status: 400 });
  const run = await createRun({
    name: String(body.name).slice(0, 120),
    company: String(body.company).slice(0, 120),
    title: body.title ? String(body.title).slice(0, 120) : undefined,
    linkedinUrl: body.linkedinUrl ? String(body.linkedinUrl).slice(0, 300) : undefined,
    pastedContext: body.pastedContext ? String(body.pastedContext).slice(0, 4000) : undefined,
    sellerId: String(body.sellerId || "ai-ops"),
    batchId: body.batchId,
    expected: body.expected,
  });
  return Response.json({ id: run.id });
}

export async function GET() {
  const runs = await getStore().listRuns(500);
  return Response.json({ runs });
}
