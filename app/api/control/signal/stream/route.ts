// Signaling inbox as Server-Sent Events.
//
// SSE rather than WebSockets on purpose: it needs no extra dependency and no
// separate socket server, works under plain Node on the UW server as well as
// on Vercel, and EventSource reconnects on its own. The client sends its last
// seen id on reconnect so nothing is lost across a drop.
//
// Deployment note: behind Apache this needs proxy buffering off, or messages
// sit in a buffer and signaling stalls. See the nickel deploy runbook.

import { checkSlotAccess, denied } from "@/lib/control-guard";
import { heartbeatDevice, pullSignals } from "@/lib/db";

/** Poll cadence against the signals table. Fast enough for call setup. */
const POLL_MS = 700;
/** Reconnect well before any proxy or platform idle timeout. */
const MAX_STREAM_MS = 4 * 60 * 1000;
const KEEPALIVE_MS = 15 * 1000;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const slotId = params.get("slotId") ?? "";
  const deviceId = params.get("deviceId") ?? "";
  const since = Number(params.get("since") ?? "0");

  if (!slotId || !deviceId) {
    return new Response("slotId and deviceId are required", { status: 400 });
  }

  const access = await checkSlotAccess(slotId);
  if (!access.ok) return denied(access);

  let lastId = Number.isFinite(since) && since > 0 ? since : 0;
  const startedAt = Date.now();

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(keepalive);
        try {
          controller.close();
        } catch {
          // Already closed by the client going away.
        }
      };

      request.signal.addEventListener("abort", finish);
      send("ready", { deviceId, since: lastId });

      const keepalive = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);

      const poll = setInterval(async () => {
        if (closed) return;
        try {
          const messages = await pullSignals(deviceId, lastId);
          for (const m of messages) {
            lastId = m.id;
            send("signal", { id: m.id, from: m.fromDevice, payload: m.payload });
          }
          // Reading the inbox is proof the tab is alive.
          await heartbeatDevice(deviceId);
        } catch {
          // A transient database blip shouldn't kill the stream; the next tick
          // retries, and the client reconnects if the stream really dies.
        }

        if (Date.now() - startedAt > MAX_STREAM_MS) {
          send("reconnect", { since: lastId });
          finish();
        }
      }, POLL_MS);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Belt and braces for reverse proxies that honour it (nginx).
      "X-Accel-Buffering": "no",
    },
  });
}
