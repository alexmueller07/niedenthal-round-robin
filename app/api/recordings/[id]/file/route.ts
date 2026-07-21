// Authenticated playback. Recordings live outside the web root and are only
// ever reachable through here, so a participant can fetch the conversations
// they were in and nobody else's.

import { checkSlotAccess, checkPpsSecret, denied } from "@/lib/control-guard";
import { getRecording } from "@/lib/db";
import { fileExists, readStreamFor } from "@/lib/storage";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { Readable } from "node:stream";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) return new Response("Not found", { status: 404 });

  // The PPS app authenticates with a shared secret rather than a cookie.
  if (!checkPpsSecret(request)) {
    const access = await checkSlotAccess(recording.slotId);
    if (!access.ok) return denied(access);

    // A participant may only ever fetch a conversation they were part of.
    if (
      access.role === "participant" &&
      recording.participantA !== access.participantId &&
      recording.participantB !== access.participantId
    ) {
      return new Response("Forbidden", { status: 403 });
    }
  }

  if (!(await fileExists(recording.storageKey))) {
    return new Response("Recording file is missing", { status: 404 });
  }

  const stream = Readable.toWeb(
    readStreamFor(recording.storageKey)
  ) as NodeReadableStream<Uint8Array>;

  return new Response(stream as unknown as BodyInit, {
    headers: {
      "Content-Type": recording.mimeType,
      "Cache-Control": "private, no-store",
    },
  });
}
