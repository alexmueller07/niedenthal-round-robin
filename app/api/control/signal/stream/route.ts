// Signaling inbox as Server-Sent Events.
//
// SSE rather than WebSockets on purpose: it needs no extra dependency and no
// separate socket server, works under plain Node on the UW server as well as
// on Vercel, and EventSource reconnects on its own. The client sends its last
// seen id on reconnect so nothing is lost across a drop.
//
// Deployment note: behind Apache this needs proxy buffering off, or messages
// sit in a buffer and signaling stalls. See the nickel deploy runbook.

import { canActAsDevice, checkSlotAccess, denied } from "@/lib/control-guard";
import { heartbeatDevice, pullSignals } from "@/lib/db";

/** Poll cadence against the signals table. Fast enough for call setup. */
const POLL_MS = 700;
/** Reconnect well before any proxy or platform idle timeout. */
const MAX_STREAM_MS = 4 * 60 * 1000;
const KEEPALIVE_MS = 15 * 1000;
/**
 * How often the poll loop stamps the device's last_seen. The staleness window
 * in listLiveDevices is 30s, so writing on every 700ms tick (~86 writes a
 * minute per device) buys nothing over writing every 10s.
 */
const HEARTBEAT_MS = 10 * 1000;

export const dynamic = "force-dynamic";
// The stream deliberately runs up to MAX_STREAM_MS before asking the client
// to reconnect; the platform's default function timeout is shorter than that
// and would cut streams off mid-flight.
export const maxDuration = 300;

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

  // Subscribing as a deviceId means receiving everything addressed to it —
  // including the WebRTC handshakes that carry live A/V of other rooms. Slot
  // access alone must not grant that; the device has to be the caller's own.
  if (!(await canActAsDevice(access, slotId, deviceId))) {
    return new Response("Forbidden", { status: 403 });
  }

  let lastId = Number.isFinite(since) && since > 0 ? since : 0;
  const startedAt = Date.now();
  const encoder = new TextEncoder();

  // Teardown state lives outside the stream so cancel() (reader torn down)
  // and abort (request gone) share one path, and a double teardown is a no-op.
  let closed = false;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;

  const finish = () => {
    if (closed) return;
    closed = true;
    if (pollTimer) clearTimeout(pollTimer);
    if (keepaliveTimer) clearInterval(keepaliveTimer);
    try {
      streamController?.close();
    } catch {
      // Already closed by the client going away.
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      // The client can already be gone by the time the body starts — an abort
      // listener added now would never fire for that.
      if (request.signal.aborted) {
        finish();
        return;
      }
      request.signal.addEventListener("abort", finish);
      send("ready", { deviceId, since: lastId });

      keepaliveTimer = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, KEEPALIVE_MS);

      // Re-arming timeout rather than setInterval: the next tick is scheduled
      // only after this one's queries resolve, so a slow Neon round-trip can
      // never overlap the following tick and deliver the same signal twice.
      let lastHeartbeatAt = 0;
      const tick = async () => {
        if (closed) return;
        try {
          const messages = await pullSignals(deviceId, lastId);
          for (const m of messages) {
            lastId = m.id;
            send("signal", { id: m.id, from: m.fromDevice, payload: m.payload });
          }
          // Reading the inbox is proof the tab is alive.
          if (Date.now() - lastHeartbeatAt >= HEARTBEAT_MS) {
            lastHeartbeatAt = Date.now();
            await heartbeatDevice(deviceId);
          }
        } catch {
          // A transient database blip shouldn't kill the stream; the next tick
          // retries, and the client reconnects if the stream really dies.
        }

        if (Date.now() - startedAt > MAX_STREAM_MS) {
          send("reconnect", { since: lastId });
          finish();
          return;
        }
        if (!closed) pollTimer = setTimeout(() => void tick(), POLL_MS);
      };
      pollTimer = setTimeout(() => void tick(), POLL_MS);
    },
    // The reader side can go away without an abort event (runtime tears the
    // response down); without this the poll loop keeps hitting the database
    // for nobody until the stream cap.
    cancel() {
      finish();
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
