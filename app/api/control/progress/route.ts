// Live participant progress for one session, as JSON for the control
// center's board. Split out from the page render so the board can poll
// without re-rendering the whole server component tree, and so freshness
// can be computed against the server clock rather than trusting the
// browser's.

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/control-guard";
import { getSlot, listAssignmentsForSlot, listParticipants } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = await requireAdminApi();
  if (denied) return denied;

  const slotId = request.nextUrl.searchParams.get("slotId");
  if (!slotId) {
    return NextResponse.json({ error: "slotId required" }, { status: 400 });
  }
  const slot = await getSlot(slotId).catch(() => null);
  if (!slot) {
    return NextResponse.json({ error: "unknown slot" }, { status: 404 });
  }

  const [assignments, participants] = await Promise.all([
    listAssignmentsForSlot(slotId),
    listParticipants(),
  ]);
  const nameById = new Map(participants.map((p) => [p.id, p.fullName]));

  // Invited people are included deliberately: someone who is physically
  // present but never confirmed still shows up on the board instead of
  // being invisible to the RA watching it.
  const roster = assignments
    .filter((a) => ["invited", "confirmed", "attended"].includes(a.status))
    .map((a) => ({
      assignmentId: a.id,
      name: a.participantId
        ? (nameById.get(a.participantId) ?? "Unknown")
        : "—",
      status: a.status,
      liveStatus: a.liveStatus,
      needsHelp: a.needsHelp,
      ppsStage: a.ppsStage,
      ppsPercent: a.ppsPercent,
      ppsUpdatedAt: a.ppsUpdatedAt,
    }));

  return NextResponse.json({
    serverNow: new Date().toISOString(),
    currentRound: slot.currentRound,
    roster,
  });
}
