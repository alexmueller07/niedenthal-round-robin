import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { isLive, propose } from "@/lib/engine";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  await requireAdminPage();
  const state = await loadFullState();
  const { slots, participants, assignments, settings, raCountBySlot, snapshot } = state;

  const today = snapshot.today;
  const activeParticipants = participants.filter((p) => p.status === "active");

  const upcoming = slots
    .filter((s) => s.date >= today && (s.status === "open" || s.status === "scheduled"))
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  const liveBySlot = new Map<string, { invited: number; confirmed: number }>();
  for (const a of assignments) {
    if (!isLive(a.status)) continue;
    const entry = liveBySlot.get(a.slotId) ?? { invited: 0, confirmed: 0 };
    if (a.status === "confirmed") entry.confirmed += 1;
    else entry.invited += 1;
    liveBySlot.set(a.slotId, entry);
  }

  const availabilityCount = new Map<string, number>();
  for (const { participantId } of snapshot.availability) {
    availabilityCount.set(participantId, (availabilityCount.get(participantId) ?? 0) + 1);
  }

  const proposal = propose(snapshot);
  const waitingForSeat = proposal.unplaced.length;
  const proposedInvites = proposal.slots.reduce((n, s) => n + s.invitees.length, 0);
  const unconfirmed = assignments.filter(
    (a) => a.status === "invited" && (slots.find((s) => s.id === a.slotId)?.date ?? "") >= today
  ).length;
  const noAvailability = activeParticipants.filter(
    (p) => (availabilityCount.get(p.id) ?? 0) === 0
  ).length;

  const stats = [
    { label: "Active participants", value: activeParticipants.length },
    { label: "Upcoming sessions", value: upcoming.length },
    { label: "Waiting for a seat", value: waitingForSeat },
    { label: "Unconfirmed invites", value: unconfirmed },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Board</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Everything that needs a decision, at a glance.
          </p>
        </div>
        <Link href="/admin/schedule" className="btn-primary">
          Run scheduler
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.label}</p>
          </div>
        ))}
      </div>

      {(proposedInvites > 0 || proposal.unfillable.length > 0 || noAvailability > 0) && (
        <section className="card border-badger/30 bg-badger-soft p-5">
          <h2 className="font-bold">Needs attention</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {proposedInvites > 0 && (
              <li>
                The scheduler can seat <strong>{proposedInvites}</strong> participant
                {proposedInvites === 1 ? "" : "s"} right now —{" "}
                <Link href="/admin/schedule" className="font-semibold underline underline-offset-4">
                  review and send invitations
                </Link>
                .
              </li>
            )}
            {proposal.unfillable.map((u) => {
              const slot = slots.find((s) => s.id === u.slotId);
              return (
                <li key={u.slotId}>
                  {slot ? `${formatDateShort(slot.date)} ${formatTimeRange(slot.startTime, slot.endTime)}` : u.slotId}{" "}
                  has only {u.eligible} of {u.needed} needed people — consider more
                  recruitment or merging times.
                </li>
              );
            })}
            {noAvailability > 0 && (
              <li>
                <strong>{noAvailability}</strong> active participant
                {noAvailability === 1 ? " has" : "s have"} not submitted any availability
                yet — worth a nudge email.
              </li>
            )}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-bold">Upcoming sessions</h2>
        {upcoming.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            No upcoming slots.{" "}
            <Link href="/admin/slots" className="font-semibold underline underline-offset-4">
              Create session slots
            </Link>{" "}
            to get started.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {upcoming.map((slot) => {
              const live = liveBySlot.get(slot.id) ?? { invited: 0, confirmed: 0 };
              const total = live.invited + live.confirmed;
              const target = settings.groupMin;
              const pct = Math.min(100, Math.round((live.confirmed / target) * 100));
              const raCount = raCountBySlot.get(slot.id) ?? 0;
              const staffed = raCount >= settings.minRas;
              return (
                <Link
                  key={slot.id}
                  href={`/admin/sessions/${slot.id}`}
                  className="card block p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">{formatDateShort(slot.date)}</p>
                      <p className="text-sm text-ink-soft">
                        {formatTimeRange(slot.startTime, slot.endTime)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span
                        className={`chip ${
                          slot.status === "scheduled"
                            ? "bg-green-100 text-green-800"
                            : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {slot.status}
                      </span>
                      <span
                        className={`chip ${
                          staffed ? "bg-stone-100 text-stone-600" : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {raCount} RA{raCount === 1 ? "" : "s"}
                        {staffed ? "" : ` (need ${settings.minRas})`}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-ink-soft">
                      <span>
                        {live.confirmed} confirmed · {live.invited} invited
                      </span>
                      <span>
                        target {settings.groupMin}–{settings.groupMax}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className={`h-full rounded-full ${
                          live.confirmed >= target ? "bg-green-500" : "bg-badger"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    {total > 0 && total < target && (
                      <p className="mt-1.5 text-xs text-amber-700">
                        {target - total} more needed to run
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
