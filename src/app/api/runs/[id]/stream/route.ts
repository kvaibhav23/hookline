import { after } from "next/server";
import { executeRun } from "@/lib/pipeline";
import { getStore } from "@/lib/store";
import { TERMINAL } from "@/lib/types";

export const maxDuration = 300;

// Server-Sent Events. If the run is claimable (queued, or abandoned by a dead worker), this request
// executes it and streams each stage live. Otherwise it replays + tails the stored events.
//
// The run must not depend on the browser staying connected: `after` keeps the function alive until
// the pipeline finishes even if the rep closes the tab, and stages are checkpointed, so a worker that
// is killed anyway is picked up by the next viewer via the stale-claim in the store.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const store = getStore();
  const enc = new TextEncoder();
  let closed = false;
  req.signal.addEventListener("abort", () => (closed = true));

  let finished!: () => void;
  const work = new Promise<void>((r) => (finished = r));
  after(() => work);

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
      try {
        let last = 0;
        for (const e of await store.getEvents(id)) {
          send("event", e);
          last = e.seq;
        }
        const claim = await store.claimRun(id);
        if (claim) {
          await executeRun(
            id,
            (e) => {
              send("event", e);
              last = e.seq;
            },
            { reclaimed: claim === "stale" },
          );
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
      } catch (e) {
        send("error", { message: String(e instanceof Error ? e.message : e).slice(0, 300) });
      } finally {
        finished();
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "content-type": "text/event-stream", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" },
  });
}
