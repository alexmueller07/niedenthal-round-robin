// Assignment engine — pure functions, no I/O.
//
// Takes a snapshot of the scheduling state and proposes session rosters:
// which participants to invite to which candidate slots. The caller (admin
// "Schedule" page) shows the proposal for approval before anything is
// written or emailed.
//
// Reproducibility: every ordering decision that is not determined by the
// priority rules flows through one seeded PRNG (lab rule: randomization must
// be documented and reproducible). Same snapshot + same seed => same proposal.

import type { AssignmentRole, AssignmentStatus, Settings, SlotStatus } from "./types";

export interface EngineSlot {
  id: string;
  date: string; // YYYY-MM-DD — sortable lexicographically
  startTime: string; // HH:MM — sortable lexicographically
  status: SlotStatus;
  raCount: number;
  /** A session needs a designated head RA, not just enough bodies. */
  hasHead: boolean;
  followUpOf: string | null;
}

export interface EngineParticipant {
  id: string;
  createdAt: string; // ISO — sortable lexicographically
  status: "active" | "completed" | "withdrawn";
}

export interface EngineAssignment {
  participantId: string;
  slotId: string;
  status: AssignmentStatus;
  role: AssignmentRole;
  assignedAt: string;
}

export interface EngineSnapshot {
  /** Today's date, YYYY-MM-DD. Slots on/after this date count as upcoming. */
  today: string;
  slots: EngineSlot[];
  participants: EngineParticipant[];
  /** participantId -> set of slotIds the participant marked available. */
  availability: ReadonlyArray<{ participantId: string; slotId: string }>;
  assignments: ReadonlyArray<EngineAssignment>;
  settings: Settings;
}

export interface SlotProposal {
  slotId: string;
  /** New invitations to create, in priority order. */
  invitees: Array<{ participantId: string; role: AssignmentRole }>;
  /** Live (invited/confirmed) assignments already on the slot, kept as-is. */
  existingLive: number;
  /** Total members after approval (existing members + new member invitees). */
  projectedMembers: number;
}

export interface EngineProposal {
  seed: number;
  slots: SlotProposal[];
  /** Viable future slots that could not reach groupMin eligible people. */
  unfillable: Array<{ slotId: string; eligible: number; needed: number }>;
  /** Active participants with availability but no live or proposed seat. */
  unplaced: string[];
  /**
   * Slots being filled that have no designated head RA. Empty when
   * requireHeadRa is on, because those slots are excluded instead.
   */
  headless: string[];
}

/** Mulberry32 — small deterministic PRNG, good enough for tie-breaking. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** An assignment currently holding a seat (pending or accepted). */
export function isLive(status: AssignmentStatus): boolean {
  return status === "invited" || status === "confirmed";
}

function isUpcoming(slot: EngineSlot, today: string): boolean {
  return slot.date >= today;
}

/**
 * Participants who attended the given slot — the roster a follow-up slot is
 * restricted to (same people finish their remaining conversations together).
 */
export function attendedRoster(
  assignments: ReadonlyArray<EngineAssignment>,
  slotId: string
): Set<string> {
  const roster = new Set<string>();
  for (const a of assignments) {
    if (a.slotId === slotId && a.status === "attended") roster.add(a.participantId);
  }
  return roster;
}

export function propose(snapshot: EngineSnapshot): EngineProposal {
  const { settings, today } = snapshot;
  const rand = mulberry32(settings.seed);

  const availableSlotsByParticipant = new Map<string, Set<string>>();
  for (const { participantId, slotId } of snapshot.availability) {
    let set = availableSlotsByParticipant.get(participantId);
    if (!set) {
      set = new Set();
      availableSlotsByParticipant.set(participantId, set);
    }
    set.add(slotId);
  }

  const slotById = new Map(snapshot.slots.map((s) => [s.id, s]));

  // Participants already holding a seat for an upcoming slot are settled.
  const settled = new Set<string>();
  const liveCountBySlot = new Map<string, number>();
  const liveMemberCountBySlot = new Map<string, number>();
  for (const a of snapshot.assignments) {
    const slot = slotById.get(a.slotId);
    if (!slot || !isLive(a.status) || !isUpcoming(slot, today)) continue;
    if (slot.status === "canceled") continue;
    settled.add(a.participantId);
    liveCountBySlot.set(a.slotId, (liveCountBySlot.get(a.slotId) ?? 0) + 1);
    if (a.role === "member") {
      liveMemberCountBySlot.set(a.slotId, (liveMemberCountBySlot.get(a.slotId) ?? 0) + 1);
    }
  }

  const attendedCount = new Map<string, number>();
  for (const a of snapshot.assignments) {
    if (a.status === "attended") {
      attendedCount.set(a.participantId, (attendedCount.get(a.participantId) ?? 0) + 1);
    }
  }

  // Candidate slots: upcoming, open, and staffed by enough RAs; earliest first.
  //
  // A missing head RA only blocks the session when requireHeadRa is on. It
  // ships off, so a headless session still fills but is reported in
  // `headless` for the caller to flag — see the note on Settings.requireHeadRa.
  const candidates = snapshot.slots
    .filter(
      (s) =>
        s.status === "open" &&
        isUpcoming(s, today) &&
        s.raCount >= settings.minRas &&
        (!settings.requireHeadRa || s.hasHead)
    )
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  const activeParticipants = snapshot.participants.filter((p) => p.status === "active");

  // Pre-shuffle once, then stable-sort by priority keys: the shuffle order is
  // the seeded tie-break for participants with equal priority.
  const shuffled = seededShuffle(activeParticipants, rand);
  const prioritized = shuffled.sort((a, b) => {
    const attended = (attendedCount.get(a.id) ?? 0) - (attendedCount.get(b.id) ?? 0);
    if (attended !== 0) return attended; // fewer sessions attended first
    return a.createdAt.localeCompare(b.createdAt); // earlier sign-up first
  });

  const placed = new Set<string>();
  const proposals: SlotProposal[] = [];
  const unfillable: EngineProposal["unfillable"] = [];

  for (const slot of candidates) {
    const roster = slot.followUpOf
      ? attendedRoster(snapshot.assignments, slot.followUpOf)
      : null;

    const eligible = prioritized.filter((p) => {
      if (placed.has(p.id) || settled.has(p.id)) return false;
      if (!availableSlotsByParticipant.get(p.id)?.has(slot.id)) return false;
      if (roster && !roster.has(p.id)) return false;
      return true;
    });

    const existingLive = liveCountBySlot.get(slot.id) ?? 0;
    const existingMembers = liveMemberCountBySlot.get(slot.id) ?? 0;
    const projected = existingLive + eligible.length;

    if (projected < settings.groupMin) {
      if (eligible.length > 0 || existingLive > 0) {
        unfillable.push({
          slotId: slot.id,
          eligible: projected,
          needed: settings.groupMin,
        });
      }
      continue;
    }

    const memberSeats = Math.max(0, settings.groupMax - existingMembers);
    const alternateSeats = settings.overrecruit;
    const invitees: SlotProposal["invitees"] = [];
    for (const p of eligible) {
      if (invitees.length >= memberSeats + alternateSeats) break;
      invitees.push({
        participantId: p.id,
        role: invitees.length < memberSeats ? "member" : "alternate",
      });
      placed.add(p.id);
    }

    proposals.push({
      slotId: slot.id,
      invitees,
      existingLive,
      projectedMembers:
        existingMembers + invitees.filter((i) => i.role === "member").length,
    });
  }

  const unplaced = activeParticipants
    .filter(
      (p) =>
        !placed.has(p.id) &&
        !settled.has(p.id) &&
        [...(availableSlotsByParticipant.get(p.id) ?? [])].some((slotId) => {
          const s = slotById.get(slotId);
          return s !== undefined && s.status === "open" && isUpcoming(s, today);
        })
    )
    .map((p) => p.id);

  // Sessions we're about to fill that nobody is designated to lead.
  const headless = proposals
    .filter((p) => p.invitees.length > 0 && slotById.get(p.slotId)?.hasHead === false)
    .map((p) => p.slotId);

  return { seed: settings.seed, slots: proposals, unplaced, unfillable, headless };
}

/**
 * When a member is marked no-show/canceled on session day, the seat passes to
 * the alternate who was invited earliest and has confirmed. Returns the
 * assignment to promote, or null.
 */
export function alternateToPromote(
  slotAssignments: ReadonlyArray<EngineAssignment>
): EngineAssignment | null {
  const confirmedAlternates = slotAssignments
    .filter((a) => a.role === "alternate" && a.status === "confirmed")
    .sort((a, b) => a.assignedAt.localeCompare(b.assignedAt));
  return confirmedAlternates[0] ?? null;
}
