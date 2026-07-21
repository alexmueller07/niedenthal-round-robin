// Camera and recording routing — pure functions, no I/O.
//
// This is the heart of the control center. Everything downstream (which feed
// the RA sees, which file a recording writes to, which clips load in the PPS
// app for a given participant) is derived from `slots.rotation`, which
// lib/rotation.ts already computes: round -> room -> dyad.
//
// Nothing here re-decides who is where. The rotation is the single source of
// truth; these functions only read it from different angles.

import type { Dyad, Recording, Rotation } from "./types";

/** The dyad in one room during one round, or null if that room sits empty. */
export function dyadInRoom(
  rotation: Rotation | null,
  round: number,
  roomIndex: number
): Dyad | null {
  if (!rotation) return null;
  const plan = rotation.find((r) => r.round === round);
  return plan?.dyads.find((d) => d.room === roomIndex) ?? null;
}

/**
 * Which room a participant is in for a round, or null when they're sitting out
 * (7–8 person sessions rotate a pair out each round).
 */
export function roomForParticipant(
  rotation: Rotation | null,
  round: number,
  participantId: string
): number | null {
  if (!rotation) return null;
  const plan = rotation.find((r) => r.round === round);
  if (!plan) return null;
  const dyad = plan.dyads.find((d) => d.a === participantId || d.b === participantId);
  return dyad ? dyad.room : null;
}

/** The other half of a participant's dyad in a round, or null. */
export function partnerOf(
  rotation: Rotation | null,
  round: number,
  participantId: string
): string | null {
  if (!rotation) return null;
  const plan = rotation.find((r) => r.round === round);
  if (!plan) return null;
  const dyad = plan.dyads.find((d) => d.a === participantId || d.b === participantId);
  if (!dyad) return null;
  return dyad.a === participantId ? dyad.b : dyad.a;
}

export interface PlannedRecording {
  round: number;
  roomIndex: number;
  participantA: string;
  participantB: string;
}

/**
 * Every conversation a session should capture, in round-then-room order. The
 * control center renders this as its coverage matrix, so an RA can see at a
 * glance whether anything was missed.
 */
export function plannedRecordings(rotation: Rotation | null): PlannedRecording[] {
  if (!rotation) return [];
  const out: PlannedRecording[] = [];
  for (const plan of [...rotation].sort((x, y) => x.round - y.round)) {
    for (const dyad of [...plan.dyads].sort((x, y) => x.room - y.room)) {
      out.push({
        round: plan.round,
        roomIndex: dyad.room,
        participantA: dyad.a,
        participantB: dyad.b,
      });
    }
  }
  return out;
}

/**
 * The clips one participant appears in, in round order. This is what the PPS
 * app asks for: a participant rates their own conversations, so the routing
 * question "which video goes on this screen?" is answered by the dyad stamped
 * on each recording at capture time.
 */
export function clipsForParticipant(
  recordings: readonly Recording[],
  participantId: string
): Recording[] {
  return recordings
    .filter((r) => r.participantA === participantId || r.participantB === participantId)
    .sort((a, b) => a.round - b.round);
}

/**
 * Storage path for a capture, relative to RECORDING_DIR. Deterministic, so a
 * retry of the same (session, round, room) overwrites rather than orphaning a
 * half-written file. Participant ids are in the name to make the drive
 * browsable, matching the `recordings` row exactly.
 */
export function storageKeyFor(input: {
  slotId: string;
  round: number;
  roomIndex: number;
  participantA: string | null;
  participantB: string | null;
  extension?: string;
}): string {
  const pair = [input.participantA ?? "unknown", input.participantB ?? "unknown"]
    .map((id) => id.slice(0, 8))
    .join("-");
  const ext = input.extension ?? "webm";
  return `${input.slotId}/round-${input.round}/room-${input.roomIndex}-${pair}.${ext}`;
}

/** True when every planned conversation has a stored recording. */
export function captureComplete(
  rotation: Rotation | null,
  recordings: readonly Recording[]
): boolean {
  const planned = plannedRecordings(rotation);
  if (planned.length === 0) return false;
  const stored = new Set(
    recordings.filter((r) => r.status === "stored").map((r) => `${r.round}|${r.roomIndex}`)
  );
  return planned.every((p) => stored.has(`${p.round}|${p.roomIndex}`));
}
