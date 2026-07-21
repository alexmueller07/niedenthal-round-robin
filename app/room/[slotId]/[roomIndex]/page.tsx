// Conversation-room kiosk page. Admin-only: this streams live video of
// participants, so it must never sit on an unauthenticated URL (IRB 2020-1657).

import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";
import { getSettings, getSlot, listParticipants } from "@/lib/db";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import { dyadInRoom } from "@/lib/routing";
import RoomStation from "./RoomStation";

export const dynamic = "force-dynamic";

export default async function RoomPage({
  params,
}: {
  params: Promise<{ slotId: string; roomIndex: string }>;
}) {
  await requireAdminPage();
  const { slotId, roomIndex: roomIndexRaw } = await params;

  const roomIndex = Number(roomIndexRaw);
  if (!Number.isInteger(roomIndex) || roomIndex < 1) notFound();

  const slot = await getSlot(slotId).catch(() => null);
  if (!slot) notFound();
  if (roomIndex > slot.roomCount) notFound();

  const [participants, settings] = await Promise.all([listParticipants(), getSettings()]);
  const nameById = new Map(participants.map((p) => [p.id, p.fullName]));

  const round = Math.max(1, slot.currentRound);
  const dyad = dyadInRoom(slot.rotation, round, roomIndex);

  return (
    <RoomStation
      slotId={slot.id}
      roomIndex={roomIndex}
      round={round}
      pair={
        dyad
          ? {
              a: nameById.get(dyad.a) ?? "Unknown",
              b: nameById.get(dyad.b) ?? "Unknown",
            }
          : null
      }
      conversationMinutes={settings.conversationMinutes}
      sessionLabel={`${formatDateShort(slot.date)} ${formatTimeRange(slot.startTime, slot.endTime)}`}
    />
  );
}
