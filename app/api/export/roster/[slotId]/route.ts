// Roster CSV export — keyed on email so the PPS app's round-robin sign-in
// (email-based) can consume it directly.

import { isAdmin } from "@/lib/auth";
import { getSlot, listAssignmentsForSlot, listParticipants } from "@/lib/db";

function csvEscape(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slotId: string }> }
) {
  if (!(await isAdmin())) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { slotId } = await params;
  const slot = await getSlot(slotId).catch(() => null);
  if (!slot) return new Response("Not found", { status: 404 });

  const [assignments, participants] = await Promise.all([
    listAssignmentsForSlot(slotId),
    listParticipants(),
  ]);
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const header =
    "email,netid,full_name,role,status,session_date,session_start,session_end";
  const lines = assignments.flatMap((a) => {
    const p = participantById.get(a.participantId);
    if (!p) return [];
    return [
      [
        csvEscape(p.email),
        csvEscape(p.netid ?? ""),
        csvEscape(p.fullName),
        a.role,
        a.status,
        slot.date,
        slot.startTime,
        slot.endTime,
      ].join(","),
    ];
  });

  return new Response([header, ...lines].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="roster_${slot.date}_${slot.startTime.replace(":", "")}.csv"`,
    },
  });
}
