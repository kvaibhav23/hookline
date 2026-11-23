import { createRun } from "@/lib/pipeline";
import { getStore } from "@/lib/store";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getStore().getRun(id);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  const next = await createRun({ ...run.input, sellerId: b.sellerId || run.input.sellerId, batchId: undefined });
  return Response.json({ id: next.id });
}
