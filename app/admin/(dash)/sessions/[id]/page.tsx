import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";
import { getSlot, listAssignmentsForSlot, listParticipants } from "@/lib/db";
import { formatDate, formatTimeRange } from "@/lib/format";
import AttendanceRow from "./AttendanceRow";
import SessionActions from "./SessionActions";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const slot = await getSlot(id).catch(() => null);
  if (!slot) notFound();

  const [assignments, participants] = await Promise.all([
    listAssignmentsForSlot(id),
    listParticipants(),
  ]);
  const participantById = new Map(participants.map((p) => [p.id, p]));

  const rows = assignments
    .map((a) => ({ assignment: a, participant: participantById.get(a.participantId) }))
    .filter((r) => r.participant !== undefined);

  const active = rows.filter(
    (r) => r.assignment.status !== "canceled" && r.assignment.status !== "no_show"
  );
  const resolved = rows.filter(
    (r) => r.assignment.status === "canceled" || r.assignment.status === "no_show"
  );
  const confirmedCount = rows.filter((r) => r.assignment.status === "confirmed").length;
  const attendedCount = rows.filter((r) => r.assignment.status === "attended").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">
            <Link href="/admin" className="underline-offset-4 hover:underline">
              Board
            </Link>{" "}
            / Session
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {formatDate(slot.date)}
          </h1>
          <p className="text-ink-soft">
            {formatTimeRange(slot.startTime, slot.endTime)} ·{" "}
            <span className="capitalize">{slot.status}</span>
            {slot.followUpOf && " · follow-up session"}
          </p>
        </div>
        <SessionActions slot={slot} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{active.length}</p>
          <p className="text-sm text-ink-soft">On the roster</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{confirmedCount}</p>
          <p className="text-sm text-ink-soft">Confirmed</p>
        </div>
        <div className="card p-4">
          <p className="text-2xl font-bold tabular-nums">{attendedCount}</p>
          <p className="text-sm text-ink-soft">Checked in</p>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">Roster</h2>
        {active.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            Nobody is assigned yet — run the{" "}
            <Link href="/admin/schedule" className="font-semibold underline underline-offset-4">
              scheduler
            </Link>
            .
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {active.map(({ assignment, participant }) => (
              <AttendanceRow
                key={assignment.id}
                assignment={assignment}
                participant={participant!}
              />
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-ink-soft">No-shows &amp; cancellations</h2>
          <ul className="card divide-y divide-line opacity-80">
            {resolved.map(({ assignment, participant }) => (
              <li key={assignment.id} className="flex items-center justify-between p-4 text-sm">
                <span>
                  {participant!.fullName}
                  <span className="ml-2 text-stone-400">{participant!.email}</span>
                </span>
                <span
                  className={`chip ${
                    assignment.status === "no_show"
                      ? "bg-badger-soft text-badger"
                      : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {assignment.status === "no_show" ? "no-show" : "canceled"}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            No-shows are automatically re-invited to their next compatible session.
          </p>
        </section>
      )}
    </div>
  );
}
