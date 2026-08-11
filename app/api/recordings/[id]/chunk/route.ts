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
  // A failed take's file is already suspect; appending more only muddies what
  // little of it might be salvageable.
  if (recording.status === "failed") {
    return new Response("Recording is marked failed", { status: 409 });
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return new Response(null, { status: 204 });
  if (body.byteLength > MAX_CHUNK_BYTES) {
    return new Response("Chunk too large", { status: 413 });
  }

  // Chunks append blindly to the file, so a duplicated, replayed, or
  // out-of-order request would corrupt the video without anyone noticing.
  // Each upload carries its index; anything but the expected next one is
  // refused, and the client treats the 409 as a dirty take.
  const indexHeader = request.headers.get("x-chunk-index");
  const chunkIndex = indexHeader === null ? NaN : Number(indexHeader);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
    return new Response("X-Chunk-Index is required", { status: 400 });
  }
  if (chunkIndex !== recording.nextChunkIndex) {
    return new Response(
      `Out-of-order chunk: expected ${recording.nextChunkIndex}, got ${chunkIndex}`,
      { status: 409 }
    );
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
