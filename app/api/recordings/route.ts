// Opens a recording for one room in one round.
//
// The dyad is read from the session's rotation and stamped onto the row here,
// at capture time. That stamp is the routing key: it is what later answers
// "which clips belong to this participant?" without re-deriving anything.

import { checkPpsSecret, requireAdminApi } from "@/lib/control-guard";
import {
  getRecordingForRoom,
  getSlot,
  listRecordingsForSlot,
  openRecording,
} from "@/lib/db";
import { dyadInRoom, storageKeyFor } from "@/lib/routing";
import { isStorageConfigured, removeFile } from "@/lib/storage";

export async function POST(request: Request) {
  // The Lab Recorder desktop app has no cookie to present, so it authenticates
  // with the same shared secret the PPS app already uses.
  if (!checkPpsSecret(request)) {
    const unauthorized = await requireAdminApi();
    if (unauthorized) return unauthorized;
  }

  if (!isStorageConfigured()) {
    return Response.json(
      { error: "RECORDING_DIR is not set — recordings have nowhere to go." },
      { status: 503 }
    );
  }

  let body: {
    slotId?: string;
    roomIndex?: number;
    round?: number;
    mimeType?: string;
    /**
     * Container the caller will actually write. The browser recorder produces
     * webm; the native recorder produces mp4, which is what the PPS dyad task
     * accepts (it rejects webm outright). Defaults to webm so existing callers
     * are unaffected.
     */
    extension?: string;
    force?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const slotId = String(body.slotId ?? "");
  const roomIndex = Math.floor(Number(body.roomIndex));
  if (!slotId || !Number.isFinite(roomIndex) || roomIndex < 1) {
    return new Response("slotId and roomIndex are required", { status: 400 });
  }

  const slot = await getSlot(slotId);
  if (!slot) return new Response("Session not found", { status: 404 });

  const round = Number.isFinite(Number(body.round))
    ? Math.floor(Number(body.round))
    : slot.currentRound;
  if (round < 1) {
    return Response.json(
      { error: "The session hasn't started a round yet — generate the rotation first." },
      { status: 409 }
    );
  }

  // A take can still be mid-flight for this (session, round, room) — another
  // tab, or a kiosk that crashed and left the row open. Wiping its file out
  // from under a live recorder corrupts data, so refuse unless a person has
  // explicitly chosen to replace it (the kiosk confirms before forcing).
  const existing = await getRecordingForRoom(slotId, round, roomIndex);
  if (
    existing &&
    (existing.status === "recording" || existing.status === "uploading") &&
    body.force !== true
  ) {
    return Response.json(
      {
        error: "A recording for this room and round is already in progress.",
        conflict: "in_progress",
      },
      { status: 409 }
    );
  }

  const dyad = dyadInRoom(slot.rotation, round, roomIndex);
  const mimeType = String(body.mimeType ?? "video/webm").slice(0, 60);

  // The extension lands in a filename, so it is constrained rather than
  // trusted — the key is otherwise entirely server-generated.
  const requested = String(body.extension ?? "webm").toLowerCase();
  const extension = /^[a-z0-9]{2,5}$/.test(requested) ? requested : "webm";

  const storageKey = storageKeyFor({
    slotId,
    round,
    roomIndex,
    participantA: dyad?.a ?? null,
    participantB: dyad?.b ?? null,
    extension,
  });

  // Re-opening the same (session, round, room) means a retry — clear the old
  // partial file so chunks don't append onto a previous take. This runs only
  // after the in-progress guard has decided the retry may proceed.
  await removeFile(storageKey);

  const recording = await openRecording({
    slotId,
    round,
    roomIndex,
    participantA: dyad?.a ?? null,
    participantB: dyad?.b ?? null,
    storageKey,
    mimeType,
  });

  return Response.json({
    id: recording.id,
    round: recording.round,
    roomIndex: recording.roomIndex,
    participantA: recording.participantA,
    participantB: recording.participantB,
    unassigned: dyad === null,
    // The native recorder writes the file itself, straight to the Research
    // Drive share this server reads from, so it needs to be told where. The
    // browser recorder ignores this and uploads chunks as before.
    storageKey: recording.storageKey,
  });
}

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const slotId = new URL(request.url).searchParams.get("slotId") ?? "";
  if (!slotId) return new Response("slotId is required", { status: 400 });

  return Response.json({ recordings: await listRecordingsForSlot(slotId) });
}
