// Builds the engine's input snapshot from the database.

import "server-only";
import {
  getSettings,
  listAssignments,
  listParticipantAvailability,
  listParticipants,
  listRaAvailability,
  listRas,
  listSlots,
} from "./db";
import type { EngineSnapshot } from "./engine";
import { todayInMadison } from "./format";
import type { Assignment, Participant, Ra, Settings, Slot } from "./types";

export interface FullState {
  snapshot: EngineSnapshot;
  slots: Slot[];
  participants: Participant[];
  ras: Ra[];
  assignments: Assignment[];
  raAvailability: Array<{ raId: string; slotId: string }>;
  settings: Settings;
  raCountBySlot: Map<string, number>;
}

export async function loadFullState(): Promise<FullState> {
  const [slots, participants, ras, assignments, raAvailability, participantAvailability, settings] =
    await Promise.all([
      listSlots(),
      listParticipants(),
      listRas(),
      listAssignments(),
      listRaAvailability(),
      listParticipantAvailability(),
      getSettings(),
    ]);

  const activeRaIds = new Set(ras.filter((r) => r.active).map((r) => r.id));
  const raCountBySlot = new Map<string, number>();
  for (const { raId, slotId } of raAvailability) {
    if (!activeRaIds.has(raId)) continue;
    raCountBySlot.set(slotId, (raCountBySlot.get(slotId) ?? 0) + 1);
  }

  const snapshot: EngineSnapshot = {
    today: todayInMadison(),
    slots: slots.map((s) => ({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      status: s.status,
      raCount: raCountBySlot.get(s.id) ?? 0,
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
    settings,
    raCountBySlot,
  };
}
