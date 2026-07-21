// Opens a recording for one room in one round.
//
// The dyad is read from the session's rotation and stamped onto the row here,
// at capture time. That stamp is the routing key: it is what later answers
// "which clips belong to this participant?" without re-deriving anything.

import { requireAdminApi } from "@/lib/control-guard";
import { getSlot, listRecordingsForSlot, openRecording } from "@/lib/db";
import { dyadInRoom, storageKeyFor } from "@/lib/routing";
import { isStorageConfigured, removeFile } from "@/lib/storage";

export async function POST(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  if (!isStorageConfigured()) {
    return Response.json(
      { error: "RECORDING_DIR is not set — recordings have nowhere to go." },
      { status: 503 }
    );
  }

  let body: { slotId?: string; roomIndex?: number; round?: number; mimeType?: string };
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

  const dyad = dyadInRoom(slot.rotation, round, roomIndex);
  const mimeType = String(body.mimeType ?? "video/webm").slice(0, 60);
  const storageKey = storageKeyFor({
    slotId,
    round,
    roomIndex,
    participantA: dyad?.a ?? null,
    participantB: dyad?.b ?? null,
  });

  // Re-opening the same (session, round, room) means a retry — clear the old
  // partial file so chunks don't append onto a previous take.
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
  });
}

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const slotId = new URL(request.url).searchParams.get("slotId") ?? "";
  if (!slotId) return new Response("slotId is required", { status: 400 });

  return Response.json({ recordings: await listRecordingsForSlot(slotId) });
}
