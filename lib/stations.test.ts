import { describe, expect, it } from "vitest";
import { parseStationKey, parseStationReport, sortStations } from "./stations";

describe("parseStationReport", () => {
  it("reads what Lab Suite 1.5.0 sends", () => {
    expect(
      parseStationReport({
        stationKey: "P-0123",
        label: "Green (Left) · P0123 · Dyad 014 · R2",
        stage: "Conversation rating — Block 2",
        percent: 140,
      })
    ).toEqual({
      stationKey: "p-0123",
      label: "Green (Left) · P0123 · Dyad 014 · R2",
      stage: "Conversation rating — Block 2",
      percent: 100,
      help: null,
    });
  });

  it("raises and lowers the help flag, raising winning", () => {
    expect(parseStationReport({ stationKey: "p-1", stage: "x", needsHelp: true })?.help).toBe(true);
    expect(parseStationReport({ stationKey: "p-1", stage: "x", helpCleared: true })?.help).toBe(
      false
    );
    expect(
      parseStationReport({ stationKey: "p-1", stage: "x", needsHelp: true, helpCleared: true })
        ?.help
    ).toBe(true);
  });

  it("leaves percent empty when there is none", () => {
    expect(parseStationReport({ stationKey: "p-1", stage: "x", percent: null })?.percent).toBeNull();
  });

  it.each([
    ["no body", null],
    ["no key", { stage: "x" }],
    ["no stage", { stationKey: "p-1" }],
    ["a key with a slash", { stationKey: "p/1", stage: "x" }],
    ["an over-long key", { stationKey: "p-" + "1".repeat(100), stage: "x" }],
  ])("rejects %s", (_label, body) => {
    expect(parseStationReport(body)).toBeNull();
  });

  it("caps long text instead of rejecting it", () => {
    const report = parseStationReport({ stationKey: "p-1", stage: "s".repeat(500), label: "l".repeat(500) });
    expect(report?.stage).toHaveLength(120);
    expect(report?.label).toHaveLength(120);
  });
});

describe("parseStationKey", () => {
  it("normalises like the report does", () => {
    expect(parseStationKey(" P-0123 ")).toBe("p-0123");
    expect(parseStationKey(null)).toBeNull();
    expect(parseStationKey("p 1")).toBeNull();
  });
});

describe("sortStations", () => {
  it("puts help first, then newest", () => {
    const row = (stationKey: string, needsHelp: boolean, updatedAt: string) => ({
      stationKey,
      label: "",
      stage: "",
      percent: null,
      needsHelp,
      helpRequestedAt: null,
      updatedAt,
    });
    const sorted = sortStations([
      row("a", false, "2026-10-13T10:00:00Z"),
      row("b", true, "2026-10-13T09:00:00Z"),
      row("c", false, "2026-10-13T11:00:00Z"),
    ]);
    expect(sorted.map((r) => r.stationKey)).toEqual(["b", "c", "a"]);
  });
});
