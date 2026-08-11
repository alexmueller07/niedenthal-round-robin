// Finalizes a recording. Marks it stored only if bytes actually landed on
// disk, so a capture that silently wrote nothing shows as failed on the
// control center's coverage matrix rather than passing as complete.

import { checkPpsSecret, requireAdminApi } from "@/lib/control-guard";
import { closeRecording, getRecording } from "@/lib/db";
import { fileSize } from "@/lib/storage";
import type { RecordingIntegrity } from "@/lib/types";

/** Reads a finite number out of an untrusted body, or null. */
function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // The Lab Recorder desktop app has no cookie to present, so it authenticates
  // with the same shared secret the PPS app already uses.
  if (!checkPpsSecret(request)) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
  }

  const { id } = await params;
  const recording = await getRecording(id);
  if (!recording) return new Response("Recording not found", { status: 404 });

  let durationMs: number | null = null;
  let integrity: Partial<RecordingIntegrity> | null = null;
  try {
    const body = await request.json();
    const raw = Number(body?.durationMs);
    if (Number.isFinite(raw) && raw > 0) durationMs = Math.floor(raw);

    // Capture integrity, when the caller can measure it. The browser recorder
    // cannot, and omits all of it.
    integrity = {
      captureFps: num(body?.captureFps),
      framesDropped: num(body?.framesDropped),
      framesDuplicated: num(body?.framesDuplicated),
      cfr: typeof body?.cfr === "boolean" ? body.cfr : null,
      sha256: typeof body?.sha256 === "string" ? body.sha256.slice(0, 64) : null,
      profileHash:
        typeof body?.profileHash === "string" ? body.profileHash.slice(0, 32) : null,
      recorderVersion:
        typeof body?.recorderVersion === "string"
          ? body.recorderVersion.slice(0, 32)
          : null,
    };
  } catch {
    // Duration and metrics are a nicety; the file is what matters.
  }

  // Unchanged and deliberate: "stored" means bytes are on disk, not that
  // someone said so. The native recorder writes straight to the Research Drive
  // share, so this sees the file without any upload having happened.
  const bytes = await fileSize(recording.storageKey);
  const status = bytes > 0 ? "stored" : "failed";
  await closeRecording(id, status, durationMs, integrity);

  if (status === "failed") {
    console.error("[recordings] closed with no bytes on disk", {
      recordingId: id,
      storageKey: recording.storageKey,
    });
  }

  return Response.json({ id, status, bytes });
}
