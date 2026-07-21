// CONTROL CENTER — the admin counterpart to the PPS app. Picks a session to
// run; the live view (room camera wall, recording control, participant
// progress) lives at /admin/control/[slotId].

import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { formatDate, formatDateShort, formatTimeRange } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function ControlCenterPage() {
  await requireAdminPage();
  const { slots, assignments, snapshot } = await loadFullState();
  const today = snapshot.today;

  const presentBySlot = new Map<string, number>();
  for (const a of assignments) {
    if (a.status === "confirmed" || a.status === "attended") {
      presentBySlot.set(a.slotId, (presentBySlot.get(a.slotId) ?? 0) + 1);
    }
  }

  const runnable = slots
    .filter((s) => s.status !== "canceled" && s.date >= today)
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );
  const todaySessions = runnable.filter((s) => s.date === today);
  const upcoming = runnable.filter((s) => s.date > today).slice(0, 6);

  const Card = ({ slot }: { slot: (typeof slots)[number] }) => (
    <Link
      href={`/admin/control/${slot.id}`}
      className="card block p-5 transition-shadow hover:shadow-md"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">{formatDateShort(slot.date)}</p>
          <p className="text-sm text-ink-soft">
            {formatTimeRange(slot.startTime, slot.endTime)}
          </p>
        </div>
        <span className="chip bg-stone-100 text-stone-600">
          {slot.roomCount} room{slot.roomCount === 1 ? "" : "s"}
        </span>
      </div>
      <p className="mt-3 text-sm text-ink-soft">
        {presentBySlot.get(slot.id) ?? 0} present · open control →
      </p>
    </Link>
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Control Center</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Watch the conversation rooms live, drive recording, and follow each
          participant through the PPS app.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Today — {formatDate(today)}</h2>
        {todaySessions.length === 0 ? (
          <div className="card p-6 text-ink-soft">No sessions scheduled for today.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {todaySessions.map((s) => (
              <Card key={s.id} slot={s} />
            ))}
          </div>
        )}
      </section>

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Coming up</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((s) => (
              <Card key={s.id} slot={s} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
