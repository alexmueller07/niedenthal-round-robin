import { describe, expect, it } from "vitest";
import {
  blocksToCells,
  cellsToBlocks,
  coversRange,
  mergeBlocks,
  splitIntoSessions,
  totalHours,
  availabilityCellTimes,
  coverageByCell,
  validateWeeklyBlocks,
  weeklyToPaint,
} from "./availability";

describe("mergeBlocks", () => {
  it("merges overlapping and adjacent blocks per column", () => {
    const merged = mergeBlocks([
      { column: "2026-07-20", startTime: "09:00", endTime: "10:00" },
      { column: "2026-07-20", startTime: "10:00", endTime: "11:30" },
      { column: "2026-07-20", startTime: "11:00", endTime: "12:00" },
      { column: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      { column: "2026-07-21", startTime: "09:00", endTime: "10:00" },
    ]);
    expect(merged).toEqual([
      { column: "2026-07-20", startTime: "09:00", endTime: "12:00" },
      { column: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      { column: "2026-07-21", startTime: "09:00", endTime: "10:00" },
    ]);
  });

  it("drops zero-length or inverted blocks", () => {
    expect(
      mergeBlocks([{ column: "2026-07-20", startTime: "10:00", endTime: "10:00" }])
    ).toEqual([]);
  });

  it("keeps weekday columns independent", () => {
    // The recurring weekly painter keys columns by JS weekday, not by date.
    const merged = mergeBlocks([
      { column: "1", startTime: "13:00", endTime: "15:00" },
      { column: "3", startTime: "13:00", endTime: "15:00" },
    ]);
    expect(merged).toEqual([
      { column: "1", startTime: "13:00", endTime: "15:00" },
      { column: "3", startTime: "13:00", endTime: "15:00" },
    ]);
  });
});

describe("coversRange", () => {
  const blocks = [
    { column: "2026-07-20", startTime: "13:00", endTime: "15:00" },
    { column: "2026-07-20", startTime: "15:00", endTime: "16:30" },
  ];

  it("covers a slot fully inside merged blocks", () => {
    expect(coversRange(blocks, "2026-07-20", "14:00", "16:00")).toBe(true);
  });

  it("rejects partial coverage", () => {
    expect(coversRange(blocks, "2026-07-20", "14:00", "17:00")).toBe(false);
  });

  it("rejects a different column", () => {
    expect(coversRange(blocks, "2026-07-21", "13:30", "14:30")).toBe(false);
  });
});

describe("cell round-trip", () => {
  it("cells -> blocks -> cells is lossless", () => {
    const cells = new Set([
      "2026-07-20|14:00",
      "2026-07-20|14:30",
      "2026-07-20|15:00",
      "2026-07-21|09:00",
    ]);
    const blocks = cellsToBlocks(cells);
    expect(blocks).toEqual([
      { column: "2026-07-20", startTime: "14:00", endTime: "15:30" },
      { column: "2026-07-21", startTime: "09:00", endTime: "09:30" },
    ]);
    expect(blocksToCells(blocks)).toEqual(cells);
  });

  it("round-trips weekday cells", () => {
    const cells = new Set(["1|13:00", "1|13:30", "4|09:00"]);
    expect(blocksToCells(cellsToBlocks(cells))).toEqual(cells);
  });
});

describe("splitIntoSessions", () => {
  it("splits a painted block into back-to-back sessions, dropping the remainder", () => {
    const sessions = splitIntoSessions(
      [{ column: "2026-07-20", startTime: "13:00", endTime: "18:30" }],
      120
    );
    expect(sessions).toEqual([
      { column: "2026-07-20", startTime: "13:00", endTime: "15:00" },
      { column: "2026-07-20", startTime: "15:00", endTime: "17:00" },
    ]);
  });

  it("merges touching paint strokes before splitting", () => {
    const sessions = splitIntoSessions(
      [
        { column: "2026-07-20", startTime: "13:00", endTime: "14:00" },
        { column: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      ],
      120
    );
    expect(sessions).toEqual([
      { column: "2026-07-20", startTime: "13:00", endTime: "15:00" },
    ]);
  });

  it("returns nothing for blocks shorter than a session", () => {
    expect(
      splitIntoSessions([{ column: "2026-07-20", startTime: "13:00", endTime: "14:00" }], 120)
    ).toEqual([]);
  });
});

describe("totalHours", () => {
  it("sums merged block durations", () => {
    expect(
      totalHours([
        { column: "2026-07-20", startTime: "09:00", endTime: "10:30" },
        { column: "2026-07-20", startTime: "10:00", endTime: "11:00" },
      ])
    ).toBe(2);
  });
});

describe("validateWeeklyBlocks", () => {
  it("keeps painted time that matches no shift, merged per day", () => {
    const result = validateWeeklyBlocks([
      { column: "2", startTime: "09:00", endTime: "10:00" },
      { column: "2", startTime: "10:00", endTime: "11:30" },
      { column: "0", startTime: "18:00", endTime: "21:00" },
    ]);
    expect(result).toEqual({
      ok: true,
      blocks: [
        { weekday: 0, startTime: "18:00", endTime: "21:00" },
        { weekday: 2, startTime: "09:00", endTime: "11:30" },
      ],
    });
  });

  it("accepts an empty week — 'free nowhere' is an answer", () => {
    expect(validateWeeklyBlocks([])).toEqual({ ok: true, blocks: [] });
  });

  it.each([
    ["not an array", "nope"],
    ["a date column", [{ column: "2026-10-13", startTime: "09:00", endTime: "10:00" }]],
    ["a weekday out of range", [{ column: "7", startTime: "09:00", endTime: "10:00" }]],
    ["a malformed time", [{ column: "1", startTime: "9:00", endTime: "10:00" }]],
    ["off the half hour", [{ column: "1", startTime: "09:15", endTime: "10:00" }]],
    ["before the grid opens", [{ column: "1", startTime: "08:00", endTime: "10:00" }]],
    ["after the grid closes", [{ column: "1", startTime: "20:00", endTime: "21:30" }]],
    ["an empty block", [{ column: "1", startTime: "10:00", endTime: "10:00" }]],
    ["a non-object", [null]],
  ])("rejects %s", (_label, input) => {
    expect(validateWeeklyBlocks(input).ok).toBe(false);
  });

  it("caps the number of blocks", () => {
    const many = Array.from({ length: 101 }, () => ({
      column: "1",
      startTime: "09:00",
      endTime: "09:30",
    }));
    expect(validateWeeklyBlocks(many).ok).toBe(false);
  });

  it("round-trips to painter blocks", () => {
    expect(weeklyToPaint([{ weekday: 3, startTime: "13:00", endTime: "15:00" }])).toEqual([
      { column: "3", startTime: "13:00", endTime: "15:00" },
    ]);
  });
});

describe("coverageByCell", () => {
  it("lists every RA free in each half hour", () => {
    const coverage = coverageByCell([
      { raId: "a", blocks: [{ weekday: 1, startTime: "09:00", endTime: "10:00" }] },
      { raId: "b", blocks: [{ weekday: 1, startTime: "09:30", endTime: "10:30" }] },
    ]);
    expect(coverage.get("1|09:00")).toEqual(["a"]);
    expect(coverage.get("1|09:30")).toEqual(["a", "b"]);
    expect(coverage.get("1|10:00")).toEqual(["b"]);
    expect(coverage.has("1|10:30")).toBe(false);
    expect(coverage.has("2|09:00")).toBe(false);
  });

  it("covers the painter's whole day in half hours", () => {
    const times = availabilityCellTimes();
    expect(times[0]).toBe("09:00");
    expect(times.at(-1)).toBe("20:30");
    expect(times).toHaveLength(24);
  });
});
