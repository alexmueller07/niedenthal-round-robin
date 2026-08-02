import { describe, expect, it } from "vitest";
import { addDays, buildWeeklyRoster, sessionsAhead, upcomingSessions } from "./roster";
import type { Ra, Slot, Weekday, WeeklyShift } from "./types";

function shift(
  id: string,
  weekday: Weekday,
  startTime: string,
  endTime = "16:00",
  active = true
): WeeklyShift {
  return { id, weekday, startTime, endTime, roomCount: 3, preferred: false, active };
}

function ra(id: string, name: string, active = true): Ra {
  return {
    id,
    name,
    active,
    netid: name.toLowerCase(),
    email: `${name.toLowerCase()}@wisc.edu`,
    availabilitySubmittedAt: null,
  };
}

function slot(id: string, date: string, startTime: string, shiftId: string | null): Slot {
  return {
    id,
    date,
    startTime,
    endTime: "16:00",
    roomCount: 3,
    status: "open",
    followUpOf: null,
    shiftId,
    preferred: false,
    rotation: null,
    currentRound: 0,
    headRaId: null,
    notes: "",
  };
}

describe("buildWeeklyRoster", () => {
  const shifts = [
    shift("s-wed", 3, "14:00"),
    shift("s-mon", 1, "10:00"),
    shift("s-mon-pm", 1, "14:00"),
  ];
  const ras = [ra("r1", "Ben"), ra("r2", "Alex"), ra("r3", "Reese")];

  it("orders shifts Monday first, then by start time", () => {
    const roster = buildWeeklyRoster(shifts, ras, []);
    expect(roster.map((r) => r.shiftId)).toEqual(["s-mon", "s-mon-pm", "s-wed"]);
  });

  it("puts the head RA first and the rest alphabetically", () => {
    const roster = buildWeeklyRoster(shifts, ras, [
      { raId: "r1", shiftId: "s-mon", isHead: false },
      { raId: "r2", shiftId: "s-mon", isHead: false },
      { raId: "r3", shiftId: "s-mon", isHead: true },
    ]);
    const monday = roster.find((r) => r.shiftId === "s-mon");
    expect(monday?.staff.map((p) => p.name)).toEqual(["Reese", "Alex", "Ben"]);
    expect(monday?.staff[0].isHead).toBe(true);
  });

  it("keeps shifts with nobody on them", () => {
    const roster = buildWeeklyRoster(shifts, ras, []);
    expect(roster.every((r) => r.staff.length === 0)).toBe(true);
    expect(roster).toHaveLength(3);
  });

  it("drops inactive shifts and inactive RAs", () => {
    const roster = buildWeeklyRoster(
      [...shifts, shift("s-old", 5, "09:00", "11:00", false)],
      [...ras, ra("r4", "Suhaas", false)],
      [
        { raId: "r4", shiftId: "s-mon", isHead: false },
        { raId: "r1", shiftId: "s-mon", isHead: false },
      ]
    );
    expect(roster.map((r) => r.shiftId)).not.toContain("s-old");
    expect(roster.find((r) => r.shiftId === "s-mon")?.staff.map((p) => p.name)).toEqual([
      "Ben",
    ]);
  });
});

describe("upcomingSessions", () => {
  const roster = buildWeeklyRoster(
    [shift("s-mon", 1, "10:00")],
    [ra("r1", "Ben"), ra("r2", "Alex")],
    [
      { raId: "r1", shiftId: "s-mon", isHead: true },
      { raId: "r2", shiftId: "s-mon", isHead: false },
    ]
  );

  const slots = [
    slot("sl-2", "2026-09-14", "10:00", "s-mon"),
    slot("sl-1", "2026-09-07", "10:00", "s-mon"),
    slot("sl-far", "2026-10-05", "10:00", "s-mon"),
    slot("sl-past", "2026-08-31", "10:00", "s-mon"),
  ];

  it("returns only sessions inside the window, in date order", () => {
    const out = upcomingSessions(slots, roster, "2026-09-07", 14);
    expect(out.map((s) => s.slotId)).toEqual(["sl-1", "sl-2"]);
  });

  it("includes today and excludes the day after the window", () => {
    expect(upcomingSessions(slots, roster, "2026-09-07", 1).map((s) => s.slotId)).toEqual([
      "sl-1",
    ]);
    expect(upcomingSessions(slots, roster, "2026-09-08", 7).map((s) => s.slotId)).toEqual([
      "sl-2",
    ]);
  });

  it("carries the shift's staff onto each dated session", () => {
    const [first] = upcomingSessions(slots, roster, "2026-09-07", 14);
    expect(first.staff.map((p) => p.name)).toEqual(["Ben", "Alex"]);
  });

  it("skips canceled sessions", () => {
    const canceled = { ...slot("sl-x", "2026-09-08", "10:00", "s-mon"), status: "canceled" as const };
    const out = upcomingSessions([...slots, canceled], roster, "2026-09-07", 14);
    expect(out.map((s) => s.slotId)).not.toContain("sl-x");
  });

  it("uses per-slot coverage for one-off sessions that have no shift", () => {
    const oneOff = slot("sl-followup", "2026-09-09", "13:00", null);
    const out = upcomingSessions(
      [...slots, oneOff],
      roster,
      "2026-09-07",
      14,
      new Map([["sl-followup", [{ id: "r2", name: "Alex", email: null, isHead: false }]]])
    );
    expect(out.find((s) => s.slotId === "sl-followup")?.staff.map((p) => p.name)).toEqual([
      "Alex",
    ]);
  });
});

describe("sessionsAhead", () => {
  const roster = buildWeeklyRoster(
    [shift("s-mon", 1, "10:00")],
    [ra("r1", "Ben")],
    [{ raId: "r1", shiftId: "s-mon", isHead: true }]
  );
  const slots = [
    slot("sl-1", "2026-09-07", "10:00", "s-mon"),
    slot("sl-2", "2026-09-14", "10:00", "s-mon"),
    slot("sl-3", "2026-09-21", "10:00", "s-mon"),
  ];

  it("uses the window when it has sessions", () => {
    const out = sessionsAhead(slots, roster, "2026-09-07", 14, 6);
    expect(out.windowed).toBe(true);
    expect(out.sessions.map((s) => s.slotId)).toEqual(["sl-1", "sl-2"]);
  });

  it("falls back to the next sessions when the window is empty", () => {
    // Mid-summer: nothing for weeks, but the semester is already published.
    const out = sessionsAhead(slots, roster, "2026-08-02", 14, 2);
    expect(out.windowed).toBe(false);
    expect(out.sessions.map((s) => s.slotId)).toEqual(["sl-1", "sl-2"]);
  });

  it("returns nothing when there is nothing scheduled at all", () => {
    const out = sessionsAhead([], roster, "2026-08-02", 14, 6);
    expect(out.windowed).toBe(false);
    expect(out.sessions).toEqual([]);
  });
});

describe("addDays", () => {
  it("crosses a month boundary", () => {
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
  });

  it("handles zero and negative offsets", () => {
    expect(addDays("2026-09-07", 0)).toBe("2026-09-07");
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
  });
});
