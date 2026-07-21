// Finalizes a recording. Marks it stored only if bytes actually landed on
// disk, so a capture that silently wrote nothing shows as failed on the
// control center's coverage matrix rather than passing as complete.

import { requireAdminApi } from "@/lib/control-guard";
import { closeRecording, getRecording } from "@/lib/db";
import { fileSize } from "@/lib/storage";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) return new Response("Recording not found", { status: 404 });

  let durationMs: number | null = null;
  try {
    const body = await request.json();
    const raw = Number(body?.durationMs);
    if (Number.isFinite(raw) && raw > 0) durationMs = Math.floor(raw);
  } catch {
    // Duration is a nicety; the file is what matters.
  }

  const bytes = await fileSize(recording.storageKey);
  const status = bytes > 0 ? "stored" : "failed";
  await closeRecording(id, status, durationMs);

  if (status === "failed") {
    console.error("[recordings] closed with no bytes on disk", {
      recordingId: id,
      storageKey: recording.storageKey,
    });
  }

  return Response.json({ id, status, bytes });
}
