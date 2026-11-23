import { getStore } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const run = await store.getRun(id);
  if (!run) return Response.json({ error: "not found" }, { status: 404 });
  const events = await store.getEvents(id);
  return Response.json({ run, events });
}
