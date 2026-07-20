import { describe, expect, it } from "vitest";
import { generateShiftSlots, weekdayDatesBetween, weekdayName } from "./schedule";
import type { WeeklyShift } from "./types";

// Reference: in 2026, Sept 1 is a Tuesday, so Sept 7/14/21/28 are Mondays.

describe("weekdayDatesBetween", () => {
  it("returns every matching weekday in an inclusive range", () => {
    expect(weekdayDatesBetween("2026-09-02", "2026-09-30", 1)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
  });

  it("includes the endpoints when they land on the weekday", () => {
    expect(weekdayDatesBetween("2026-09-07", "2026-09-21", 1)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
    ]);
  });

  it("returns a single date when start equals end on the weekday", () => {
    expect(weekdayDatesBetween("2026-09-07", "2026-09-07", 1)).toEqual(["2026-09-07"]);
  });

  it("returns nothing when the range never hits the weekday", () => {
    // Wed only, asking for Sundays (0)
    expect(weekdayDatesBetween("2026-09-02", "2026-09-04", 0)).toEqual([]);
  });

  it("returns nothing when end precedes start", () => {
    expect(weekdayDatesBetween("2026-09-30", "2026-09-01", 1)).toEqual([]);
  });
});

function shift(overrides: Partial<WeeklyShift> = {}): WeeklyShift {
  return {
    id: "s1",
    weekday: 1,
    startTime: "14:00",
    endTime: "16:00",
    roomCount: 3,
    preferred: false,
    active: true,
    ...overrides,
  };
}

describe("generateShiftSlots", () => {
  it("expands an active shift into one slot per matching weekday", () => {
    const result = generateShiftSlots([shift()], "2026-09-02", "2026-09-30");
    expect(result.map((s) => s.date)).toEqual([
      "2026-09-07",
      "2026-09-14",
      "2026-09-21",
      "2026-09-28",
    ]);
    expect(result.every((s) => s.shiftId === "s1" && s.startTime === "14:00")).toBe(true);
  });

  it("skips inactive shifts", () => {
    const result = generateShiftSlots([shift({ active: false })], "2026-09-02", "2026-09-30");
    expect(result).toEqual([]);
  });

  it("carries the preferred flag onto generated slots", () => {
    const result = generateShiftSlots(
      [shift({ preferred: true })],
      "2026-09-07",
      "2026-09-07"
    );
    expect(result).toHaveLength(1);
    expect(result[0].preferred).toBe(true);
  });

  it("sorts mixed shifts by date then start time", () => {
    const shifts = [
      shift({ id: "wed", weekday: 3, startTime: "10:00", endTime: "12:00" }),
      shift({ id: "mon-pm", weekday: 1, startTime: "14:00", endTime: "16:00" }),
      shift({ id: "mon-am", weekday: 1, startTime: "09:00", endTime: "11:00" }),
    ];
    const result = generateShiftSlots(shifts, "2026-09-07", "2026-09-09");
    // Mon Sep 7 (09:00 then 14:00), Wed Sep 9 (10:00)
    expect(result.map((s) => `${s.date} ${s.startTime}`)).toEqual([
      "2026-09-07 09:00",
      "2026-09-07 14:00",
      "2026-09-09 10:00",
    ]);
  });
});

describe("weekdayName", () => {
  it("maps JS getDay() numbering", () => {
    expect(weekdayName(0)).toBe("Sunday");
    expect(weekdayName(1)).toBe("Monday");
    expect(weekdayName(6)).toBe("Saturday");
  });
});
