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
  let reportedBytes: number | null = null;
  try {
    const body = await request.json();
    const raw = Number(body?.durationMs);
    if (Number.isFinite(raw) && raw > 0) durationMs = Math.floor(raw);
    const claimed = num(body?.bytes);
    if (claimed !== null && claimed > 0) reportedBytes = claimed;

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

  // "stored" means bytes are on disk — but *whose* disk depends on the caller.
  //
  // The browser recorder uploads chunks to this server, so the file must be
  // visible here, and that is checked directly: someone merely saying "done"
  // does not make a capture complete.
  //
  // The native Lab Recorder writes straight to the Research Drive share and
  // has already re-read its copy there and matched it against a SHA-256 —
  // a strictly stronger check than stat-ing the file. This server may not be
  // able to see the share at all (DoIT shared hosting cannot mount it), so a
  // secret-authenticated close that carries the recorder's checksum is
  // trusted on its own. The PPS station re-verifies the same checksum when it
  // fetches the file, closing the loop end to end.
  const observed = await fileSize(recording.storageKey);
  const recorderVerified = checkPpsSecret(request) && Boolean(integrity?.sha256);
  const status = observed > 0 || recorderVerified ? "stored" : "failed";
  const bytes = observed > 0 ? observed : recorderVerified ? (reportedBytes ?? 0) : 0;
  await closeRecording(
    id,
    status,
    durationMs,
    integrity,
    // Only fill the size in when this server never saw the file; the chunk
    // path has already been keeping the column up to date.
    observed > 0 ? null : recorderVerified ? reportedBytes : null
  );

  if (status === "failed") {
    console.error("[recordings] closed with no bytes on disk", {
      recordingId: id,
      storageKey: recording.storageKey,
    });
  }

  return Response.json({ id, status, bytes });
}
