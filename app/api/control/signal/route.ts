// WebRTC signaling: post a message addressed to another device on the session.
// Offers, answers, and ICE candidates all ride through here as opaque payloads
// — the server never inspects them, it only delivers.

import { checkSlotAccess, denied } from "@/lib/control-guard";
import { pushSignal, sweepOldSignals } from "@/lib/db";

/** Signaling payloads are small; anything larger is a bug or an abuse. */
const MAX_PAYLOAD_BYTES = 64 * 1024;

export async function POST(request: Request) {
  let body: {
    slotId?: string;
    fromDevice?: string;
    toDevice?: string;
    payload?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const slotId = String(body.slotId ?? "");
  const fromDevice = String(body.fromDevice ?? "");
  const toDevice = String(body.toDevice ?? "");
  if (!slotId || !fromDevice || !toDevice) {
    return new Response("slotId, fromDevice and toDevice are required", { status: 400 });
  }

  const access = await checkSlotAccess(slotId);
  if (!access.ok) return denied(access);

  if (JSON.stringify(body.payload ?? null).length > MAX_PAYLOAD_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }

  await pushSignal({ slotId, fromDevice, toDevice, payload: body.payload ?? null });

  // Signaling traffic is disposable; keep the table from growing forever.
  if (Math.floor(Number(new Date()) / 1000) % 20 === 0) await sweepOldSignals();

  return new Response(null, { status: 204 });
}
