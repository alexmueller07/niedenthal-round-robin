// Builds the engine's input snapshot from the database.

import "server-only";
import {
  getSettings,
  listAssignments,
  listBlackoutDates,
  listParticipantAvailability,
  listParticipants,
  listRaAvailability,
  listRas,
  listRaShiftPreferences,
  listRaShifts,
  listSlots,
  listWeeklyShifts,
  type RaShift,
} from "./db";
import type { EngineSnapshot } from "./engine";
import { todayInMadison } from "./format";
import type {
  Assignment,
  BlackoutDate,
  Participant,
  Ra,
  Settings,
  Slot,
  WeeklyShift,
} from "./types";

export interface FullState {
  snapshot: EngineSnapshot;
  slots: Slot[];
  participants: Participant[];
  ras: Ra[];
  assignments: Assignment[];
  raAvailability: Array<{ raId: string; slotId: string }>;
  weeklyShifts: WeeklyShift[];
  raShifts: RaShift[];
  /** What RAs said they can staff (self-service), vs. raShifts which is binding. */
  raShiftPreferences: Array<{ raId: string; shiftId: string }>;
  blackoutDates: BlackoutDate[];
  settings: Settings;
  /** Effective RA coverage per slot: shift assignments ∪ per-slot availability. */
  raCountBySlot: Map<string, number>;
  /** Effective head RA per slot: the slot override, else its shift's head. */
  headRaBySlot: Map<string, string>;
}

export async function loadFullState(): Promise<FullState> {
  const [
    slots,
    participants,
    ras,
    assignments,
    raAvailability,
    participantAvailability,
    weeklyShifts,
    raShifts,
    raShiftPreferences,
    blackoutDates,
    settings,
  ] = await Promise.all([
    listSlots(),
    listParticipants(),
    listRas(),
    listAssignments(),
    listRaAvailability(),
    listParticipantAvailability(),
    listWeeklyShifts(),
    listRaShifts(),
    listRaShiftPreferences(),
    listBlackoutDates(),
    getSettings(),
  ]);

  const activeRaIds = new Set(ras.filter((r) => r.active).map((r) => r.id));

  // Active RAs assigned to each recurring shift, and each shift's head.
  const raIdsByShift = new Map<string, Set<string>>();
  const headByShift = new Map<string, string>();
  for (const { raId, shiftId, isHead } of raShifts) {
    if (!activeRaIds.has(raId)) continue;
    let set = raIdsByShift.get(shiftId);
    if (!set) {
      set = new Set();
      raIdsByShift.set(shiftId, set);
    }
    set.add(raId);
    if (isHead) headByShift.set(shiftId, raId);
  }

  // Effective coverage per slot: shift-derived RAs unioned with any per-slot
  // availability (used for ad-hoc / follow-up slots that have no shift).
  const raSetBySlot = new Map<string, Set<string>>();
  const coverFor = (slotId: string): Set<string> => {
    let set = raSetBySlot.get(slotId);
    if (!set) {
      set = new Set();
      raSetBySlot.set(slotId, set);
    }
    return set;
  };
  for (const slot of slots) {
    if (!slot.shiftId) continue;
    const shiftRas = raIdsByShift.get(slot.shiftId);
    if (shiftRas) for (const raId of shiftRas) coverFor(slot.id).add(raId);
  }
  for (const { raId, slotId } of raAvailability) {
    if (!activeRaIds.has(raId)) continue;
    coverFor(slotId).add(raId);
  }

  const raCountBySlot = new Map<string, number>();
  for (const [slotId, set] of raSetBySlot) raCountBySlot.set(slotId, set.size);

  // Effective head per slot: the per-session override wins, otherwise the head
  // of the shift it was generated from. Either way the head must still be an
  // active RA who actually covers the slot.
  const headRaBySlot = new Map<string, string>();
  for (const slot of slots) {
    const candidate =
      slot.headRaId ?? (slot.shiftId ? headByShift.get(slot.shiftId) : undefined);
    if (!candidate || !activeRaIds.has(candidate)) continue;
    if (!raSetBySlot.get(slot.id)?.has(candidate)) continue;
    headRaBySlot.set(slot.id, candidate);
  }

  const snapshot: EngineSnapshot = {
    today: todayInMadison(),
    slots: slots.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      status: s.status,
      raCount: raCountBySlot.get(s.id) ?? 0,
      hasHead: headRaBySlot.has(s.id),
      followUpOf: s.followUpOf,
    })),
    participants: participants.map((p) => ({
      id: p.id,
      createdAt: p.createdAt,
      status: p.status === "active" ? "active" : p.status,
    })),
    availability: participantAvailability,
    assignments: assignments.map((a) => ({
      participantId: a.participantId,
      slotId: a.slotId,
      status: a.status,
      role: a.role,
      assignedAt: a.assignedAt,
    })),
    settings,
  };

  return {
    snapshot,
    slots,
    participants,
    ras,
    assignments,
    raAvailability,
    weeklyShifts,
    raShifts,
    raShiftPreferences,
    blackoutDates,
    settings,
    raCountBySlot,
    headRaBySlot,
  };
}
