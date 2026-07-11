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
  it("merges overlapping and adjacent blocks per date", () => {
    const merged = mergeBlocks([
      { date: "2026-07-20", startTime: "09:00", endTime: "10:00" },
      { date: "2026-07-20", startTime: "10:00", endTime: "11:30" },
      { date: "2026-07-20", startTime: "11:00", endTime: "12:00" },
      { date: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      { date: "2026-07-21", startTime: "09:00", endTime: "10:00" },
    ]);
    expect(merged).toEqual([
      { date: "2026-07-20", startTime: "09:00", endTime: "12:00" },
      { date: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      { date: "2026-07-21", startTime: "09:00", endTime: "10:00" },
    ]);
  });

  it("drops zero-length or inverted blocks", () => {
    expect(
      mergeBlocks([{ date: "2026-07-20", startTime: "10:00", endTime: "10:00" }])
    ).toEqual([]);
  });
});

describe("coversRange", () => {
  const blocks = [
    { date: "2026-07-20", startTime: "13:00", endTime: "15:00" },
    { date: "2026-07-20", startTime: "15:00", endTime: "16:30" },
  ];

  it("covers a slot fully inside merged blocks", () => {
    expect(coversRange(blocks, "2026-07-20", "14:00", "16:00")).toBe(true);
  });

  it("rejects partial coverage", () => {
    expect(coversRange(blocks, "2026-07-20", "14:00", "17:00")).toBe(false);
  });

  it("rejects a different date", () => {
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
      { date: "2026-07-20", startTime: "14:00", endTime: "15:30" },
      { date: "2026-07-21", startTime: "09:00", endTime: "09:30" },
    ]);
    expect(blocksToCells(blocks)).toEqual(cells);
  });
});

describe("splitIntoSessions", () => {
  it("splits a painted block into back-to-back sessions, dropping the remainder", () => {
    const sessions = splitIntoSessions(
      [{ date: "2026-07-20", startTime: "13:00", endTime: "18:30" }],
      120
    );
    expect(sessions).toEqual([
      { date: "2026-07-20", startTime: "13:00", endTime: "15:00" },
      { date: "2026-07-20", startTime: "15:00", endTime: "17:00" },
    ]);
  });

  it("merges touching paint strokes before splitting", () => {
    const sessions = splitIntoSessions(
      [
        { date: "2026-07-20", startTime: "13:00", endTime: "14:00" },
        { date: "2026-07-20", startTime: "14:00", endTime: "15:00" },
      ],
      120
    );
    expect(sessions).toEqual([
      { date: "2026-07-20", startTime: "13:00", endTime: "15:00" },
    ]);
  });

  it("returns nothing for blocks shorter than a session", () => {
    expect(
      splitIntoSessions([{ date: "2026-07-20", startTime: "13:00", endTime: "14:00" }], 120)
    ).toEqual([]);
  });
});

describe("totalHours", () => {
  it("sums merged block durations", () => {
    expect(
      totalHours([
        { date: "2026-07-20", startTime: "09:00", endTime: "10:30" },
        { date: "2026-07-20", startTime: "10:00", endTime: "11:00" },
      ])
    ).toBe(2);
  });
});
