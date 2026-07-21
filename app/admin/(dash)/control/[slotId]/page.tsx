// Live control center for one session: the room camera wall, what has been
// captured, and where each participant is in the PPS app.

import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-guard";
import {
  getSlot,
  listAssignmentsForSlot,
  listParticipants,
  listRecordingsForSlot,
} from "@/lib/db";
import { formatDate, formatTimeRange } from "@/lib/format";
import { captureComplete, dyadInRoom, plannedRecordings } from "@/lib/routing";
import { isStorageConfigured } from "@/lib/storage";
import ControlWall from "./ControlWall";

export const dynamic = "force-dynamic";

export default async function ControlSessionPage({
  params,
}: {
  params: Promise<{ slotId: string }>;
}) {
  await requireAdminPage();
  const { slotId } = await params;

  const slot = await getSlot(slotId).catch(() => null);
  if (!slot) notFound();

  const [assignments, participants, recordings] = await Promise.all([
    listAssignmentsForSlot(slotId),
    listParticipants(),
    listRecordingsForSlot(slotId),
  ]);

  const nameById = new Map(participants.map((p) => [p.id, p.fullName]));
  const name = (id: string | null) => (id ? (nameById.get(id) ?? "Unknown") : "—");

  const currentRound = Math.max(1, slot.currentRound);
  const totalRounds = slot.rotation?.length ?? 0;

  const roomLabels = Array.from({ length: slot.roomCount }, (_, i) => {
    const dyad = dyadInRoom(slot.rotation, currentRound, i + 1);
    return {
      roomIndex: i + 1,
      names: dyad ? `${name(dyad.a)} & ${name(dyad.b)}` : null,
    };
  });

  // Planned captures joined with what actually exists.
  const byKey = new Map(recordings.map((r) => [`${r.round}|${r.roomIndex}`, r]));
  const capture = plannedRecordings(slot.rotation).map((p) => {
    const existing = byKey.get(`${p.round}|${p.roomIndex}`);
    return {
      round: p.round,
      roomIndex: p.roomIndex,
      names: `${name(p.participantA)} & ${name(p.participantB)}`,
      status: (existing?.status ?? "missing") as
        | "missing"
        | "recording"
        | "uploading"
        | "stored"
        | "failed",
    };
  });

  const rounds =
    totalRounds > 0 ? Array.from({ length: totalRounds }, (_, i) => i + 1) : [currentRound];

  const roster = assignments
    .filter((a) => a.status === "confirmed" || a.status === "attended")
    .map((a) => ({
      id: a.id,
      name: name(a.participantId),
      liveStatus: a.liveStatus,
      needsHelp: a.needsHelp,
      ppsStage: a.ppsStage,
      ppsPercent: a.ppsPercent,
    }));

  const helpCount = roster.filter((r) => r.needsHelp).length;
  const complete = captureComplete(slot.rotation, recordings);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-soft">
            <Link href="/admin/control" className="underline-offset-4 hover:underline">
              Control Center
            </Link>{" "}
            / Session
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">{formatDate(slot.date)}</h1>
          <p className="text-ink-soft">
            {formatTimeRange(slot.startTime, slot.endTime)} · {slot.roomCount} room
            {slot.roomCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {complete && (
            <span className="chip bg-green-100 text-green-800">all rounds captured ✓</span>
          )}
          <Link
            href={`/admin/sessions/${slot.id}/run`}
            className="btn-ghost px-4 py-2 text-xs"
          >
            Session console →
          </Link>
        </div>
      </div>

      {!isStorageConfigured() && (
        <p className="card border-badger/40 bg-badger-soft p-4 text-sm text-badger">
          <strong>RECORDING_DIR isn&apos;t set</strong>, so recordings have nowhere to go
          and the room pages will refuse to start. Point it at the Research Drive mount
          before running a real session.
        </p>
      )}

      {!slot.rotation && (
        <p className="card border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          No room rotation yet — build it on the{" "}
          <Link
            href={`/admin/sessions/${slot.id}/run`}
            className="font-semibold underline underline-offset-4"
          >
            session console
          </Link>{" "}
          first. Until then the rooms don&apos;t know who they&apos;re recording.
        </p>
      )}

      {helpCount > 0 && (
        <p className="card border-badger bg-badger-soft p-4 font-bold text-badger">
          🖐 {helpCount} participant{helpCount === 1 ? "" : "s"} need help — see the
          session console.
        </p>
      )}

      <ControlWall
        slotId={slot.id}
        roomCount={slot.roomCount}
        currentRound={currentRound}
        totalRounds={totalRounds || 1}
        roomLabels={roomLabels}
        capture={capture}
        rounds={rounds}
      />

      <section>
        <h2 className="mb-1 text-lg font-bold">Participant progress</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Updates as people move through the PPS app. RAs can also set status by hand on
          the session console.
        </p>
        {roster.length === 0 ? (
          <div className="card p-6 text-ink-soft">Nobody is checked in yet.</div>
        ) : (
          <ul className="card divide-y divide-line">
            {roster.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.needsHelp && (
                    <span className="chip bg-badger-soft text-badger">needs help</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-ink-soft">
                    {r.ppsStage ?? r.liveStatus.replace(/_/g, " ")}
                  </span>
                  {r.ppsPercent !== null && (
                    <div className="h-2 w-28 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-badger"
                        style={{ width: `${r.ppsPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
