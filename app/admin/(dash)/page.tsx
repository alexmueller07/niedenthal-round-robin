// TODAY — the day-of operational home. Merges what used to be two separate
// tabs ("Board" and "Run session"): today's sessions with a direct route into
// the live console, then what needs a decision, then what's coming up.

import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { isLive, propose } from "@/lib/engine";
import { formatDate, formatDateShort, formatTimeRange } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  await requireAdminPage();
  const state = await loadFullState();
  const {
    slots,
    participants,
    assignments,
    settings,
    raCountBySlot,
    headRaBySlot,
    snapshot,
  } = state;

  const today = snapshot.today;
  const activeParticipants = participants.filter((p) => p.status === "active");

  const upcoming = slots
    .filter((s) => s.date >= today && (s.status === "open" || s.status === "scheduled"))
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );
  const todaySessions = upcoming.filter((s) => s.date === today);
  const laterSessions = upcoming.filter((s) => s.date > today);

  const liveBySlot = new Map<string, { invited: number; confirmed: number }>();
  const presentBySlot = new Map<string, number>();
  const helpBySlot = new Map<string, number>();
  for (const a of assignments) {
    if (isLive(a.status)) {
      const entry = liveBySlot.get(a.slotId) ?? { invited: 0, confirmed: 0 };
      if (a.status === "confirmed") entry.confirmed += 1;
      else entry.invited += 1;
      liveBySlot.set(a.slotId, entry);
    }
    if (a.status === "confirmed" || a.status === "attended") {
      presentBySlot.set(a.slotId, (presentBySlot.get(a.slotId) ?? 0) + 1);
    }
    if (a.needsHelp) helpBySlot.set(a.slotId, (helpBySlot.get(a.slotId) ?? 0) + 1);
  }

  const availabilityCount = new Map<string, number>();
  for (const { participantId } of snapshot.availability) {
    availabilityCount.set(participantId, (availabilityCount.get(participantId) ?? 0) + 1);
  }

  const proposal = propose(snapshot);
  const proposedInvites = proposal.slots.reduce((n, s) => n + s.invitees.length, 0);
  const unconfirmed = assignments.filter(
    (a) => a.status === "invited" && (slots.find((s) => s.id === a.slotId)?.date ?? "") >= today
  ).length;
  const noAvailability = activeParticipants.filter(
    (p) => (availabilityCount.get(p.id) ?? 0) === 0
  ).length;

  // Sessions that are staffed by enough RAs but have nobody designated to lead.
  const headless = upcoming.filter(
    (s) => (raCountBySlot.get(s.id) ?? 0) >= settings.minRas && !headRaBySlot.has(s.id)
  );

  const stats = [
    { label: "Active participants", value: activeParticipants.length },
    { label: "Upcoming sessions", value: upcoming.length },
    { label: "Waiting for a seat", value: proposal.unplaced.length },
    { label: "Unconfirmed invites", value: unconfirmed },
  ];

  const needsAttention =
    proposedInvites > 0 ||
    proposal.unfillable.length > 0 ||
    noAvailability > 0 ||
    headless.length > 0;

  const label = (slotId: string): string => {
    const s = slots.find((x) => x.id === slotId);
    return s
      ? `${formatDateShort(s.date)} ${formatTimeRange(s.startTime, s.endTime)}`
      : slotId;
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Today</h1>
          <p className="mt-1 text-sm text-ink-soft">{formatDate(today)}</p>
        </div>
        <Link href="/admin/schedule" className="btn-primary">
          Schedule &amp; fill sessions
        </Link>
      </div>

      {/* Running now */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Running today</h2>
        {todaySessions.length === 0 ? (
          <div className="card p-6 text-ink-soft">No sessions scheduled for today.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {todaySessions.map((slot) => {
              const present = presentBySlot.get(slot.id) ?? 0;
              const help = helpBySlot.get(slot.id) ?? 0;
              const started = slot.rotation !== null;
              return (
                <Link
                  key={slot.id}
                  href={`/admin/sessions/${slot.id}/run`}
                  className="card block p-5 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold">
                        {formatTimeRange(slot.startTime, slot.endTime)}
                      </p>
                      <p className="text-sm text-ink-soft">{present} present</p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {help > 0 && <span className="chip bg-badger-soft text-badger">🖐 {help}</span>}
                      <span
                        className={`chip ${
                          started ? "bg-blue-100 text-blue-800" : "bg-stone-100 text-stone-600"
                        }`}
                      >
                        {started ? `round ${slot.currentRound}` : "not started"}
                      </span>
                    </div>
                  </div>
                  <p className="mt-3 text-sm font-semibold text-badger">
                    Open live console →
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-5">
            <p className="text-3xl font-bold tabular-nums">{s.value}</p>
            <p className="mt-1 text-sm text-ink-soft">{s.label}</p>
          </div>
        ))}
      </div>

      {needsAttention && (
        <section className="card border-badger/30 bg-badger-soft p-5">
          <h2 className="font-bold">Needs attention</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {proposedInvites > 0 && (
              <li>
                The scheduler can seat <strong>{proposedInvites}</strong> participant
                {proposedInvites === 1 ? "" : "s"} right now —{" "}
                <Link
                  href="/admin/schedule"
                  className="font-semibold underline underline-offset-4"
                >
                  review and send invitations
                </Link>
                .
              </li>
            )}
            {headless.length > 0 && (
              <li>
                <strong>{headless.length}</strong> staffed session
                {headless.length === 1 ? " has" : "s have"} no head RA
                {settings.requireHeadRa
                  ? " and won't be filled until one is assigned"
                  : " — they'll still be filled, but nobody is designated to lead them"}{" "}
                —{" "}
                <Link
                  href="/admin/schedule"
                  className="font-semibold underline underline-offset-4"
                >
                  assign one
                </Link>
                .
              </li>
            )}
            {proposal.unfillable.map((u) => (
              <li key={u.slotId}>
                {label(u.slotId)} has only {u.eligible} of {u.needed} needed people —
                consider more recruitment or merging times.
              </li>
            ))}
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
        <h2 className="mb-3 text-lg font-bold">Coming up</h2>
        {laterSessions.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            No upcoming sessions.{" "}
            <Link
              href="/admin/schedule"
              className="font-semibold underline underline-offset-4"
            >
              Set the weekly schedule
            </Link>{" "}
            to generate some.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {laterSessions.slice(0, 10).map((slot) => {
              const live = liveBySlot.get(slot.id) ?? { invited: 0, confirmed: 0 };
              const total = live.invited + live.confirmed;
              const target = settings.groupMin;
              const pct = Math.min(100, Math.round((live.confirmed / target) * 100));
              const raCount = raCountBySlot.get(slot.id) ?? 0;
              const staffed = raCount >= settings.minRas;
              const hasHead = headRaBySlot.has(slot.id);
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
                          staffed && hasHead
                            ? "bg-stone-100 text-stone-600"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {raCount}/{settings.minRas} RAs
                        {staffed && !hasHead ? " · no head" : ""}
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
