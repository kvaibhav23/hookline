import { executeRun } from "@/lib/pipeline";
import { getStore } from "@/lib/store";
import { TERMINAL } from "@/lib/types";

export const maxDuration = 300;

// Server-Sent Events. If the run is queued, this request executes it and streams each stage live.
// If someone else is already executing it (or it's finished), we replay + tail the stored events.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const enc = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));

  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      let last = 0;
      for (const e of await store.getEvents(id)) {
        send("event", e);
        last = e.seq;
      }
      if (await store.claimRun(id)) {
        await executeRun(id, (e) => {
          send("event", e);
          last = e.seq;
        });
      } else {
        for (let i = 0; i < 400 && !closed; i++) {
          const run = await store.getRun(id);
          for (const e of await store.getEvents(id, last)) {
            send("event", e);
            last = e.seq;
          }
          if (!run || TERMINAL.includes(run.status)) break;
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      send("end", { id });
      try {
        controller.close();
      } catch {}
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
