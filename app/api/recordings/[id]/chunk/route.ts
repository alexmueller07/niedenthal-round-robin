// Appends one MediaRecorder chunk to a recording's file.
//
// Chunked rather than one upload at the end: a ten-minute conversation is a
// large blob to hold in a tab and lose if the browser dies, and appending
// keeps both the browser and the server flat in memory.

import { requireAdminApi } from "@/lib/control-guard";
import { addRecordingBytes, getRecording } from "@/lib/db";
import { appendChunk } from "@/lib/storage";

/** Generous ceiling for one chunk; the room page emits far smaller ones. */
const MAX_CHUNK_BYTES = 32 * 1024 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) return new Response("Recording not found", { status: 404 });
  if (recording.status === "stored") {
    return new Response("Recording is already closed", { status: 409 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return new Response(null, { status: 204 });
  if (body.byteLength > MAX_CHUNK_BYTES) {
    return new Response("Chunk too large", { status: 413 });
  }

  try {
    await appendChunk(recording.storageKey, Buffer.from(body));
  } catch (error) {
    // A failing drive is the thing most likely to go wrong here, and losing a
    // conversation silently would be much worse than a visible error.
    console.error("[recordings] chunk append failed", {
      recordingId: id,
      storageKey: recording.storageKey,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Could not write to the recording drive." }, { status: 500 });
  }

  await addRecordingBytes(id, body.byteLength);
  return new Response(null, { status: 204 });
}
