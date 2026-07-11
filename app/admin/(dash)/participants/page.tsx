import { requireAdminPage } from "@/lib/admin-guard";
import { isLive } from "@/lib/engine";
import { formatDateShort } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";
import ParticipantRow from "./ParticipantRow";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  await requireAdminPage();
  const { participants, assignments, slots, snapshot } = await loadFullState();
  const slotById = new Map(slots.map((s) => [s.id, s]));

  const availabilityCount = new Map<string, number>();
  for (const { participantId, slotId } of snapshot.availability) {
    const slot = slotById.get(slotId);
    if (slot && slot.date >= snapshot.today && slot.status !== "canceled") {
      availabilityCount.set(participantId, (availabilityCount.get(participantId) ?? 0) + 1);
    }
  }

  const rows = participants.map((p) => {
    const mine = assignments.filter((a) => a.participantId === p.id);
    const liveAssignment = mine.find((a) => {
      const slot = slotById.get(a.slotId);
      return isLive(a.status) && slot !== undefined && slot.date >= snapshot.today;
    });
    const liveSlot = liveAssignment ? slotById.get(liveAssignment.slotId) : undefined;
    return {
      participant: p,
      availability: availabilityCount.get(p.id) ?? 0,
      attended: mine.filter((a) => a.status === "attended").length,
      noShows: mine.filter((a) => a.status === "no_show").length,
      currentSession: liveSlot
        ? `${formatDateShort(liveSlot.date)} (${liveAssignment!.status})`
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Participants</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {rows.length} signed up · availability counts only upcoming slots.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-6 text-ink-soft">
          Nobody has signed up yet. Send participants the portal link — the site root
          URL — via SONA or email.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                <th className="p-4 font-semibold">Participant</th>
                <th className="p-4 font-semibold">Availability</th>
                <th className="p-4 font-semibold">Current session</th>
                <th className="p-4 font-semibold">History</th>
                <th className="p-4 font-semibold">Status</th>
                <th className="p-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <ParticipantRow key={row.participant.id} {...row} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
