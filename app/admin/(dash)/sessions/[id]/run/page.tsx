import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";
import { getSlot, listAssignmentsForSlot, listParticipants } from "@/lib/db";
import { formatDate, formatTimeRange } from "@/lib/format";
import RunConsole from "./RunConsole";

export const dynamic = "force-dynamic";

export default async function RunSessionPage({
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

  // People present in the session: confirmed or already checked in.
  const roster = assignments
    .filter((a) => a.status === "confirmed" || a.status === "attended")
    .map((a) => {
      const p = participantById.get(a.participantId);
      return {
        assignmentId: a.id,
        participantId: a.participantId,
        name: p?.fullName ?? "Unknown",
        firstName: (p?.fullName ?? "Unknown").split(" ")[0],
        liveStatus: a.liveStatus,
        needsHelp: a.needsHelp,
      };
    });

  const nameById: Record<string, string> = {};
  for (const r of roster) nameById[r.participantId] = r.firstName;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">
            <Link href="/admin" className="underline-offset-4 hover:underline">
              Today
            </Link>{" "}
            /{" "}
            <Link
              href={`/admin/sessions/${slot.id}`}
              className="underline-offset-4 hover:underline"
            >
              Session
            </Link>{" "}
            / Console
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            {formatDate(slot.date)}
          </h1>
          <p className="text-ink-soft">{formatTimeRange(slot.startTime, slot.endTime)}</p>
        </div>
        <Link href={`/admin/control/${slot.id}`} className="btn-ghost px-4 py-2 text-xs">
          Control Center →
        </Link>
      </div>

      <RunConsole
        slotId={slot.id}
        rotation={slot.rotation}
        currentRound={slot.currentRound}
        roomCount={slot.roomCount}
        roster={roster}
        nameById={nameById}
      />
    </div>
  );
}
