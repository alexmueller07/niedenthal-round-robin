import { describe, expect, it } from "vitest";
import {
  blocksToCells,
  cellsToBlocks,
  coversRange,
  mergeBlocks,
  splitIntoSessions,
  totalHours,
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
