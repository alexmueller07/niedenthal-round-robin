import { describe, expect, it } from "vitest";
import { generateRotation, type Rotation } from "./rotation";

const people = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

function pairKeys(rotation: Rotation): string[] {
  return rotation.flatMap((r) => r.dyads.map((d) => [d.a, d.b].sort().join("|")));
}

function seatsInRound(rotation: Rotation, round: number): string[] {
  const r = rotation[round];
  return [...r.dyads.flatMap((d) => [d.a, d.b]), ...r.sittingOut];
}

describe("generateRotation — 6 people, 3 rooms, 3 rounds (clean case)", () => {
  const rotation = generateRotation(people(6), { rooms: 3, rounds: 3, seed: 20260711 });

  it("produces 3 rounds of 3 dyads with nobody sitting out", () => {
    expect(rotation).toHaveLength(3);
    for (const r of rotation) {
      expect(r.dyads).toHaveLength(3);
      expect(r.sittingOut).toHaveLength(0);
    }
  });

  it("never repeats a partner across rounds", () => {
    const keys = pairKeys(rotation);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("seats all 6 people exactly once per round", () => {
    for (let r = 0; r < 3; r++) {
      const seats = seatsInRound(rotation, r);
      expect(seats).toHaveLength(6);
      expect(new Set(seats).size).toBe(6);
    }
  });

  it("uses three distinct rooms within each round", () => {
    for (const r of rotation) {
      const rooms = r.dyads.map((d) => d.room);
      expect(new Set(rooms)).toEqual(new Set([1, 2, 3]));
    }
  });

  it("never puts a participant in the same room in consecutive rounds", () => {
    const roomByPersonRound = new Map<string, Record<number, number>>();
    for (let r = 0; r < rotation.length; r++) {
      for (const d of rotation[r].dyads) {
        for (const person of [d.a, d.b]) {
          const rec = roomByPersonRound.get(person) ?? {};
          rec[r] = d.room;
          roomByPersonRound.set(person, rec);
        }
      }
    }
    for (const [, rec] of roomByPersonRound) {
      for (let r = 1; r < rotation.length; r++) {
        if (rec[r] !== undefined && rec[r - 1] !== undefined) {
          expect(rec[r]).not.toBe(rec[r - 1]);
        }
      }
    }
  });
});

describe("generateRotation — 8 people, 3 rooms", () => {
  const rotation = generateRotation(people(8), { rooms: 3, rounds: 3, seed: 42 });

  it("seats 6 and sits 2 out each round", () => {
    for (let r = 0; r < 3; r++) {
      expect(rotation[r].dyads).toHaveLength(3);
      expect(rotation[r].sittingOut).toHaveLength(2);
      const seats = seatsInRound(rotation, r);
      expect(seats).toHaveLength(8);
      expect(new Set(seats).size).toBe(8);
    }
  });

  it("never repeats a partner across rounds", () => {
    const keys = pairKeys(rotation);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("generateRotation — determinism", () => {
  it("is reproducible for the same seed", () => {
    const a = generateRotation(people(6), { rooms: 3, rounds: 3, seed: 7 });
    const b = generateRotation(people(6), { rooms: 3, rounds: 3, seed: 7 });
    expect(a).toEqual(b);
  });

  it("odd counts sit exactly one person out per round", () => {
    const rotation = generateRotation(people(7), { rooms: 3, rounds: 3, seed: 7 });
    for (const r of rotation) {
      const seats = seatsInRound(rotation, r.round - 1);
      expect(seats).toHaveLength(7);
      expect(r.sittingOut).toHaveLength(1);
    }
  });
});
