import { storageProblem } from "@/lib/config";
import { randomUUID } from "crypto";
import { createRun } from "@/lib/pipeline";

export async function POST(req: Request) {
  const problem = storageProblem();
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const { rows, sellerId } = await req.json();
  if (!Array.isArray(rows) || !rows.length) return Response.json({ error: "no rows" }, { status: 400 });
  const batchId = "b-" + randomUUID().slice(0, 6);
  const ids: string[] = [];
  for (const r of rows.slice(0, 200)) {
    if (!r.name || !r.company) continue;
    const run = await createRun({ name: r.name, company: r.company, title: r.title || undefined, linkedinUrl: r.linkedin_url || r.linkedinUrl || undefined, expected: r.expected || undefined, sellerId: sellerId || "ai-ops", batchId });
    ids.push(run.id);
  }
  return Response.json({ batchId, ids });
}
