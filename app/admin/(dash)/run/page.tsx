import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { formatDate, formatDateShort, formatTimeRange } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export default async function RunBoardPage() {
  await requireAdminPage();
  const { slots, assignments, snapshot } = await loadFullState();
  const today = snapshot.today;

  const presentBySlot = new Map<string, number>();
  const helpBySlot = new Map<string, number>();
  for (const a of assignments) {
    if (a.status === "confirmed" || a.status === "attended") {
      presentBySlot.set(a.slotId, (presentBySlot.get(a.slotId) ?? 0) + 1);
    }
    if (a.needsHelp) helpBySlot.set(a.slotId, (helpBySlot.get(a.slotId) ?? 0) + 1);
  }

  const runnable = slots
    .filter((s) => s.status !== "canceled")
    .filter((s) => s.date >= today)
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );
  const todaySessions = runnable.filter((s) => s.date === today);
  const upcoming = runnable.filter((s) => s.date > today).slice(0, 8);

  const Card = ({ slot }: { slot: (typeof slots)[number] }) => {
    const present = presentBySlot.get(slot.id) ?? 0;
    const help = helpBySlot.get(slot.id) ?? 0;
    const started = slot.rotation !== null;
    return (
      <Link
        href={`/admin/sessions/${slot.id}/run`}
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
            {help > 0 && (
              <span className="chip bg-badger-soft text-badger">🖐 {help}</span>
            )}
            <span
              className={`chip ${
                started ? "bg-blue-100 text-blue-800" : "bg-stone-100 text-stone-600"
              }`}
            >
              {started ? `round ${slot.currentRound}` : "not started"}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm text-ink-soft">
          {present} present · open console →
        </p>
      </Link>
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Run a session</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Open a session&apos;s live console to build the room rotation, move
          through the three conversation rounds, and watch for help requests.
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
