import { describe, expect, it } from "vitest";
import {
  alternateToPromote,
  attendedRoster,
  propose,
  type EngineAssignment,
  type EngineParticipant,
  type EngineSlot,
  type EngineSnapshot,
} from "./engine";
import { DEFAULT_SETTINGS } from "./types";

const TODAY = "2026-07-13";

function slot(id: string, date: string, overrides: Partial<EngineSlot> = {}): EngineSlot {
  return {
    id,
    date,
    startTime: "14:00",
    status: "open",
    raCount: DEFAULT_SETTINGS.minRas,
    hasHead: true,
    followUpOf: null,
    ...overrides,
  };
}

function participants(n: number): EngineParticipant[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    createdAt: `2026-07-01T00:00:${String(i).padStart(2, "0")}Z`,
    status: "active" as const,
  }));
}

function availabilityFor(
  people: EngineParticipant[],
  slotIds: string[]
): Array<{ participantId: string; slotId: string }> {
  return people.flatMap((p) => slotIds.map((slotId) => ({ participantId: p.id, slotId })));
}

function snapshot(overrides: Partial<EngineSnapshot>): EngineSnapshot {
  return {
    today: TODAY,
    slots: [],
    participants: [],
    availability: [],
    assignments: [],
    settings: DEFAULT_SETTINGS,
    ...overrides,
  };
}

describe("propose", () => {
  it("fills a slot with members up to groupMax then alternates", () => {
    const people = participants(12);
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people, ["s1"]),
      })
    );

    expect(result.slots).toHaveLength(1);
    const proposal = result.slots[0];
    const members = proposal.invitees.filter((i) => i.role === "member");
    const alternates = proposal.invitees.filter((i) => i.role === "alternate");
    expect(members).toHaveLength(DEFAULT_SETTINGS.groupMax);
    expect(alternates).toHaveLength(DEFAULT_SETTINGS.overrecruit);
    expect(result.unplaced).toHaveLength(12 - 10);
  });

  it("skips slots that cannot reach groupMin", () => {
    const people = participants(4); // below groupMin of 6
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people, ["s1"]),
      })
    );
    expect(result.slots).toHaveLength(0);
    expect(result.unfillable).toEqual([{ slotId: "s1", eligible: 4, needed: 6 }]);
  });

  it("never proposes the same participant to two slots", () => {
    const people = participants(8);
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20"), slot("s2", "2026-07-21")],
        participants: people,
        availability: availabilityFor(people, ["s1", "s2"]),
      })
    );
    const proposed = result.slots.flatMap((s) => s.invitees.map((i) => i.participantId));
    expect(new Set(proposed).size).toBe(proposed.length);
  });

  it("skips participants who already hold a live upcoming assignment", () => {
    const people = participants(8);
    const existing: EngineAssignment[] = [
      {
        participantId: "p1",
        slotId: "s0",
        status: "confirmed",
        role: "member",
        assignedAt: "2026-07-10T00:00:00Z",
      },
    ];
    const result = propose(
      snapshot({
        slots: [slot("s0", "2026-07-18"), slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people, ["s1"]),
        assignments: existing,
      })
    );
    const proposed = result.slots.flatMap((s) => s.invitees.map((i) => i.participantId));
    expect(proposed).not.toContain("p1");
  });

  it("re-queues no-shows: a no_show assignment does not block a new invitation", () => {
    const people = participants(6);
    const noShow: EngineAssignment[] = [
      {
        participantId: "p1",
        slotId: "s0",
        status: "no_show",
        role: "member",
        assignedAt: "2026-07-01T00:00:00Z",
      },
    ];
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people, ["s1"]),
        assignments: noShow,
      })
    );
    const proposed = result.slots.flatMap((s) => s.invitees.map((i) => i.participantId));
    expect(proposed).toContain("p1");
  });

  it("restricts follow-up slots to the parent session's attendees", () => {
    const people = participants(10);
    const attended: EngineAssignment[] = people.slice(0, 6).map((p) => ({
      participantId: p.id,
      slotId: "parent",
      status: "attended" as const,
      role: "member" as const,
      assignedAt: "2026-07-01T00:00:00Z",
    }));
    const result = propose(
      snapshot({
        slots: [slot("f1", "2026-07-22", { followUpOf: "parent" })],
        participants: people,
        availability: availabilityFor(people, ["f1"]),
        assignments: attended,
      })
    );
    expect(result.slots).toHaveLength(1);
    const proposed = result.slots[0].invitees.map((i) => i.participantId);
    const roster = new Set(people.slice(0, 6).map((p) => p.id));
    for (const id of proposed) expect(roster.has(id)).toBe(true);
  });

  it("ignores slots without enough RAs, past slots, and non-open slots", () => {
    const people = participants(8);
    const result = propose(
      snapshot({
        slots: [
          slot("understaffed", "2026-07-20", { raCount: 1 }),
          slot("past", "2026-07-01"),
          slot("canceled", "2026-07-21", { status: "canceled" }),
          slot("good", "2026-07-22"),
        ],
        participants: people,
        availability: availabilityFor(people, ["understaffed", "past", "canceled", "good"]),
      })
    );
    expect(result.slots.map((s) => s.slotId)).toEqual(["good"]);
  });

  it("fills a headless session but reports it, by default", () => {
    // Randy asked for a head RA to be required; requireHeadRa ships off so
    // scheduling isn't blocked before heads are assigned, and the engine
    // surfaces the gap instead.
    const people = participants(8);
    const result = propose(
      snapshot({
        slots: [
          slot("headless", "2026-07-20", { hasHead: false }),
          slot("led", "2026-07-22"),
        ],
        participants: people,
        availability: availabilityFor(people, ["headless", "led"]),
      })
    );
    expect(result.slots.map((s) => s.slotId)).toContain("headless");
    expect(result.headless).toEqual(["headless"]);
  });

  it("will not fill a headless session when requireHeadRa is on", () => {
    const people = participants(8);
    const result = propose(
      snapshot({
        settings: { ...DEFAULT_SETTINGS, requireHeadRa: true },
        slots: [
          slot("headless", "2026-07-20", { hasHead: false }),
          slot("led", "2026-07-22"),
        ],
        participants: people,
        availability: availabilityFor(people, ["headless", "led"]),
      })
    );
    expect(result.slots.map((s) => s.slotId)).toEqual(["led"]);
    // Excluded outright, so there is nothing to flag and it isn't "unfillable"
    // either — it was never a candidate.
    expect(result.headless).toEqual([]);
    expect(result.unfillable).toEqual([]);
  });

  it("reports no headless sessions when every filled slot has a head", () => {
    const people = participants(8);
    const result = propose(
      snapshot({
        slots: [slot("led", "2026-07-22")],
        participants: people,
        availability: availabilityFor(people, ["led"]),
      })
    );
    expect(result.headless).toEqual([]);
  });

  it("prioritizes participants with fewer attended sessions", () => {
    const people = participants(12);
    // p1..p4 already attended one session each.
    const history: EngineAssignment[] = people.slice(0, 4).map((p) => ({
      participantId: p.id,
      slotId: "old",
      status: "attended" as const,
      role: "member" as const,
      assignedAt: "2026-06-01T00:00:00Z",
    }));
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people, ["s1"]),
        assignments: history,
      })
    );
    const members = result.slots[0].invitees
      .filter((i) => i.role === "member")
      .map((i) => i.participantId);
    // The 8 members should all come from the 8 who have never attended.
    const neverAttended = new Set(people.slice(4).map((p) => p.id));
    for (const id of members) expect(neverAttended.has(id)).toBe(true);
  });

  it("is deterministic: same snapshot and seed produce identical proposals", () => {
    const people = participants(20);
    const snap = snapshot({
      slots: [slot("s1", "2026-07-20"), slot("s2", "2026-07-21")],
      participants: people,
      availability: availabilityFor(people, ["s1", "s2"]),
    });
    expect(propose(snap)).toEqual(propose(snap));
  });

  it("changes tie-break order with a different seed", () => {
    const people = participants(20).map((p) => ({ ...p, createdAt: "2026-07-01T00:00:00Z" }));
    const base = snapshot({
      slots: [slot("s1", "2026-07-20")],
      participants: people,
      availability: availabilityFor(people, ["s1"]),
    });
    const a = propose(base);
    const b = propose({ ...base, settings: { ...DEFAULT_SETTINGS, seed: 999 } });
    const order = (r: typeof a) => r.slots[0].invitees.map((i) => i.participantId).join(",");
    expect(order(a)).not.toEqual(order(b));
  });

  it("tops up a partially-filled slot without exceeding groupMax members", () => {
    const people = participants(10);
    // 3 members already invited on s1.
    const existing: EngineAssignment[] = people.slice(0, 3).map((p) => ({
      participantId: p.id,
      slotId: "s1",
      status: "invited" as const,
      role: "member" as const,
      assignedAt: "2026-07-10T00:00:00Z",
    }));
    const result = propose(
      snapshot({
        slots: [slot("s1", "2026-07-20")],
        participants: people,
        availability: availabilityFor(people.slice(3), ["s1"]),
        assignments: existing,
      })
    );
    expect(result.slots).toHaveLength(1);
    const proposal = result.slots[0];
    const newMembers = proposal.invitees.filter((i) => i.role === "member");
    expect(newMembers.length).toBe(DEFAULT_SETTINGS.groupMax - 3);
    expect(proposal.projectedMembers).toBe(DEFAULT_SETTINGS.groupMax);
  });
});

describe("alternateToPromote", () => {
  const base = { slotId: "s1", status: "confirmed" as const };

  it("returns the earliest-assigned confirmed alternate", () => {
    const list: EngineAssignment[] = [
      { ...base, participantId: "a", role: "alternate", assignedAt: "2026-07-02T00:00:00Z" },
      { ...base, participantId: "b", role: "alternate", assignedAt: "2026-07-01T00:00:00Z" },
      { ...base, participantId: "m", role: "member", assignedAt: "2026-07-01T00:00:00Z" },
    ];
    expect(alternateToPromote(list)?.participantId).toBe("b");
  });

  it("ignores unconfirmed alternates and returns null when none qualify", () => {
    const list: EngineAssignment[] = [
      {
        participantId: "a",
        slotId: "s1",
        role: "alternate",
        status: "invited",
        assignedAt: "2026-07-01T00:00:00Z",
      },
    ];
    expect(alternateToPromote(list)).toBeNull();
  });
});

describe("attendedRoster", () => {
  it("collects only attended participants of the given slot", () => {
    const list: EngineAssignment[] = [
      { participantId: "a", slotId: "s1", role: "member", status: "attended", assignedAt: "x" },
      { participantId: "b", slotId: "s1", role: "member", status: "no_show", assignedAt: "x" },
      { participantId: "c", slotId: "s2", role: "member", status: "attended", assignedAt: "x" },
    ];
    expect([...attendedRoster(list, "s1")]).toEqual(["a"]);
  });
});
