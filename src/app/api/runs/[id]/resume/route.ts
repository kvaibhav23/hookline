import { resumeRun } from "@/lib/pipeline";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { index } = await req.json();
  const run = await resumeRun(id, Number(index));
  if (!run) return Response.json({ error: "run is not paused" }, { status: 409 });
  return Response.json({ ok: true });
}
