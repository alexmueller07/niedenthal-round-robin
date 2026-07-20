"use client";

// Live session console (experimenter dashboard). Shows the current round's room
// assignments, lets the RA advance rounds and set each participant's status,
// and surfaces "needs help" flags (raised by RAs or by participants) in real
// time via a light poll.

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LiveStatus, Rotation } from "@/lib/types";
import {
  advanceRoundAction,
  generateRotationAction,
  resolveHelpAction,
  setLiveStatusAction,
} from "../../../../actions";

interface RosterEntry {
  assignmentId: string;
  participantId: string;
  name: string;
  firstName: string;
  liveStatus: LiveStatus;
  needsHelp: boolean;
}

interface RunConsoleProps {
  slotId: string;
  rotation: Rotation | null;
  currentRound: number;
  roomCount: number;
  roster: RosterEntry[];
  nameById: Record<string, string>;
}

const STATUS_META: Record<LiveStatus, { label: string; chip: string }> = {
  waiting: { label: "Waiting", chip: "bg-stone-100 text-stone-600" },
  in_conversation: { label: "In conversation", chip: "bg-blue-100 text-blue-800" },
  at_survey: { label: "At survey", chip: "bg-amber-100 text-amber-800" },
  done: { label: "Done", chip: "bg-green-100 text-green-800" },
};

const STATUS_ORDER: LiveStatus[] = ["waiting", "in_conversation", "at_survey", "done"];

export default function RunConsole({
  slotId,
  rotation,
  currentRound,
  roomCount,
  roster,
  nameById,
}: RunConsoleProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Light poll so a participant's help request (or another RA's change) shows up.
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [router]);

  const name = (id: string) => nameById[id] ?? "—";
  const helpNeeded = roster.filter((r) => r.needsHelp);

  const round = rotation && currentRound >= 1 ? rotation[currentRound - 1] : null;

  return (
    <div className="space-y-6">
      {/* Help alerts */}
      {helpNeeded.length > 0 && (
        <div className="card border-badger bg-badger-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-bold text-badger">
              🖐 {helpNeeded.length} participant{helpNeeded.length === 1 ? "" : "s"} need help
            </p>
            <div className="flex flex-wrap gap-2">
              {helpNeeded.map((r) => (
                <button
                  key={r.assignmentId}
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await resolveHelpAction(r.assignmentId);
                    })
                  }
                  className="chip bg-white text-badger hover:bg-stone-50"
                >
                  {r.name} · mark handled ✓
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {roster.length === 0 ? (
        <div className="card p-6 text-ink-soft">
          Nobody is confirmed or checked in yet. Check people in on the{" "}
          session page first, then generate the room rotation here.
        </div>
      ) : !rotation ? (
        <div className="card p-6">
          <h2 className="font-bold">Room rotation</h2>
          <p className="mt-1 text-sm text-ink-soft">
            Build the day-of rotation for the {roster.length} people present —
            three rounds, no repeated partners, and nobody in the same room twice
            in a row.
          </p>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await generateRotationAction(slotId);
              })
            }
            className="btn-primary mt-4"
          >
            {pending ? "Building…" : "Generate room rotation"}
          </button>
        </div>
      ) : (
        <>
          {/* Round control */}
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                disabled={pending || currentRound <= 1}
                onClick={() =>
                  startTransition(async () => {
                    await advanceRoundAction(slotId, -1);
                  })
                }
                className="btn-ghost px-4 py-2"
              >
                ← Prev
              </button>
              <div className="text-center">
                <p className="text-xs uppercase tracking-wide text-ink-soft">Conversation</p>
                <p className="text-lg font-bold">
                  Round {currentRound} of {rotation.length}
                </p>
              </div>
              <button
                type="button"
                disabled={pending || currentRound >= rotation.length}
                onClick={() =>
                  startTransition(async () => {
                    await advanceRoundAction(slotId, 1);
                  })
                }
                className="btn-primary px-4 py-2"
              >
                Next →
              </button>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await generateRotationAction(slotId);
                })
              }
              className="text-xs font-semibold text-stone-400 hover:text-badger"
            >
              Regenerate
            </button>
          </div>

          {/* Rooms grid for the current round */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: roomCount }, (_, i) => i + 1).map((roomNum) => {
              const dyad = round?.dyads.find((d) => d.room === roomNum);
              return (
                <div key={roomNum} className="card overflow-hidden">
                  <div className="flex items-center justify-between border-b border-line bg-stone-50 px-4 py-2">
                    <span className="font-bold">Room {roomNum}</span>
                    <span className="text-xs text-ink-soft">Round {currentRound}</span>
                  </div>
                  <div className="p-4">
                    {dyad ? (
                      <div className="space-y-1.5">
                        <p className="text-lg font-semibold">{name(dyad.a)}</p>
                        <p className="text-center text-xs text-stone-400">&amp;</p>
                        <p className="text-lg font-semibold">{name(dyad.b)}</p>
                      </div>
                    ) : (
                      <p className="text-sm text-stone-400">Empty this round</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {round && round.sittingOut.length > 0 && (
            <p className="text-sm text-ink-soft">
              Sitting out this round:{" "}
              <span className="font-medium text-ink">
                {round.sittingOut.map((id) => name(id)).join(", ")}
              </span>
            </p>
          )}
        </>
      )}

      {/* Roster with live status */}
      {roster.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Participants</h2>
          <ul className="card divide-y divide-line">
            {roster.map((r) => (
              <li
                key={r.assignmentId}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {r.needsHelp && (
                    <span className="chip bg-badger-soft text-badger">needs help</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STATUS_ORDER.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setLiveStatusAction(r.assignmentId, s);
                        })
                      }
                      aria-pressed={r.liveStatus === s}
                      className={`chip transition-colors ${
                        r.liveStatus === s
                          ? STATUS_META[s].chip
                          : "bg-white text-stone-400 hover:text-ink"
                      }`}
                    >
                      {STATUS_META[s].label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Full rotation reference */}
      {rotation && (
        <details className="card p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ink-soft">
            Full rotation (all rounds)
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-line text-left">
                  <th className="p-2 font-semibold">Round</th>
                  {Array.from({ length: roomCount }, (_, i) => (
                    <th key={i} className="p-2 font-semibold">
                      Room {i + 1}
                    </th>
                  ))}
                  <th className="p-2 font-semibold">Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rotation.map((rp) => (
                  <tr key={rp.round}>
                    <td className="p-2 font-medium">{rp.round}</td>
                    {Array.from({ length: roomCount }, (_, i) => {
                      const d = rp.dyads.find((x) => x.room === i + 1);
                      return (
                        <td key={i} className="p-2">
                          {d ? `${name(d.a)} & ${name(d.b)}` : "—"}
                        </td>
                      );
                    })}
                    <td className="p-2 text-stone-400">
                      {rp.sittingOut.map((id) => name(id)).join(", ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
