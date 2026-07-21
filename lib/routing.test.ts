import { describe, expect, it } from "vitest";
import { generateRotation } from "./rotation";
import {
  captureComplete,
  clipsForParticipant,
  dyadInRoom,
  partnerOf,
  plannedRecordings,
  roomForParticipant,
  storageKeyFor,
} from "./routing";
import type { Recording, Rotation } from "./types";

// A hand-built rotation keeps these tests readable and independent of the
// circle-method internals; the "real rotation" block at the bottom checks the
// two modules actually compose.
const ROTATION: Rotation = [
  {
    round: 1,
    dyads: [
      { room: 1, a: "amy", b: "ben" },
      { room: 2, a: "cara", b: "dan" },
      { room: 3, a: "eve", b: "fred" },
    ],
    sittingOut: [],
  },
  {
    round: 2,
    dyads: [
      { room: 2, a: "amy", b: "cara" },
      { room: 3, a: "ben", b: "eve" },
      { room: 1, a: "dan", b: "fred" },
    ],
    sittingOut: [],
  },
];

function recording(overrides: Partial<Recording> = {}): Recording {
  return {
    id: "r1",
    slotId: "s1",
    round: 1,
    roomIndex: 1,
    participantA: "amy",
    participantB: "ben",
    storageKey: "s1/round-1/room-1-amy-ben.webm",
    mimeType: "video/webm",
    bytes: 100,
    durationMs: 600_000,
    status: "stored",
    startedAt: "2026-09-08T18:00:00Z",
    endedAt: "2026-09-08T18:10:00Z",
    ...overrides,
  };
}

describe("dyadInRoom", () => {
  it("finds the pair in a room for a round", () => {
    expect(dyadInRoom(ROTATION, 2, 3)).toEqual({ room: 3, a: "ben", b: "eve" });
  });

  it("returns null for an empty room, an unknown round, or no rotation", () => {
    expect(dyadInRoom(ROTATION, 1, 9)).toBeNull();
    expect(dyadInRoom(ROTATION, 7, 1)).toBeNull();
    expect(dyadInRoom(null, 1, 1)).toBeNull();
  });
});

describe("roomForParticipant", () => {
  it("finds a participant's room whichever side of the dyad they are", () => {
    expect(roomForParticipant(ROTATION, 1, "amy")).toBe(1);
    expect(roomForParticipant(ROTATION, 1, "ben")).toBe(1);
    expect(roomForParticipant(ROTATION, 2, "amy")).toBe(2);
  });

  it("returns null for somebody sitting out", () => {
    const sitting: Rotation = [
      { round: 1, dyads: [{ room: 1, a: "amy", b: "ben" }], sittingOut: ["cara", "dan"] },
    ];
    expect(roomForParticipant(sitting, 1, "cara")).toBeNull();
  });
});

describe("partnerOf", () => {
  it("returns the other half of the dyad", () => {
    expect(partnerOf(ROTATION, 1, "amy")).toBe("ben");
    expect(partnerOf(ROTATION, 1, "ben")).toBe("amy");
    expect(partnerOf(ROTATION, 2, "fred")).toBe("dan");
  });

  it("returns null when the participant is not in that round", () => {
    expect(partnerOf(ROTATION, 1, "nobody")).toBeNull();
  });
});

describe("plannedRecordings", () => {
  it("lists every conversation in round-then-room order", () => {
    expect(plannedRecordings(ROTATION).map((p) => `${p.round}:${p.roomIndex}`)).toEqual([
      "1:1",
      "1:2",
      "1:3",
      "2:1",
      "2:2",
      "2:3",
    ]);
  });

  it("stamps the dyad on each planned capture", () => {
    const round2room1 = plannedRecordings(ROTATION).find(
      (p) => p.round === 2 && p.roomIndex === 1
    );
    expect(round2room1).toMatchObject({ participantA: "dan", participantB: "fred" });
  });

  it("is empty without a rotation", () => {
    expect(plannedRecordings(null)).toEqual([]);
  });
});

describe("clipsForParticipant", () => {
  const recordings = [
    recording({ id: "r2", round: 2, roomIndex: 2, participantA: "amy", participantB: "cara" }),
    recording({ id: "r1", round: 1, roomIndex: 1, participantA: "amy", participantB: "ben" }),
    recording({ id: "r3", round: 1, roomIndex: 2, participantA: "cara", participantB: "dan" }),
  ];

  it("returns only the clips a participant appears in, in round order", () => {
    expect(clipsForParticipant(recordings, "amy").map((r) => r.id)).toEqual(["r1", "r2"]);
  });

  it("matches on either side of the dyad", () => {
    expect(clipsForParticipant(recordings, "ben").map((r) => r.id)).toEqual(["r1"]);
    expect(clipsForParticipant(recordings, "cara").map((r) => r.id)).toEqual(["r3", "r2"]);
  });

  it("returns nothing for someone who was never recorded", () => {
    expect(clipsForParticipant(recordings, "zoe")).toEqual([]);
  });
});

describe("storageKeyFor", () => {
  it("is deterministic, so a retry overwrites instead of orphaning a file", () => {
    const input = {
      slotId: "slot-1",
      round: 2,
      roomIndex: 3,
      participantA: "aaaaaaaa-1111",
      participantB: "bbbbbbbb-2222",
    };
    expect(storageKeyFor(input)).toBe(storageKeyFor(input));
    expect(storageKeyFor(input)).toBe("slot-1/round-2/room-3-aaaaaaaa-bbbbbbbb.webm");
  });

  it("keeps a usable name when a dyad slot is empty", () => {
    expect(
      storageKeyFor({
        slotId: "s",
        round: 1,
        roomIndex: 1,
        participantA: null,
        participantB: null,
      })
    ).toBe("s/round-1/room-1-unknown-unknown.webm");
  });
});

describe("captureComplete", () => {
  it("is true only when every planned conversation is stored", () => {
    const all = plannedRecordings(ROTATION).map((p, i) =>
      recording({
        id: `r${i}`,
        round: p.round,
        roomIndex: p.roomIndex,
        participantA: p.participantA,
        participantB: p.participantB,
      })
    );
    expect(captureComplete(ROTATION, all)).toBe(true);
    expect(captureComplete(ROTATION, all.slice(1))).toBe(false);
  });

  it("ignores recordings that never finished uploading", () => {
    const all = plannedRecordings(ROTATION).map((p, i) =>
      recording({
        id: `r${i}`,
        round: p.round,
        roomIndex: p.roomIndex,
        status: i === 0 ? "failed" : "stored",
      })
    );
    expect(captureComplete(ROTATION, all)).toBe(false);
  });

  it("is false with no rotation at all", () => {
    expect(captureComplete(null, [])).toBe(false);
  });
});

describe("routing composes with the real rotation generator", () => {
  // 6 people / 3 rooms / 3 rounds is the clean protocol case.
  const ids = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const rotation = generateRotation(ids, { rooms: 3, rounds: 3, seed: 20260711 });

  it("plans one recording per room per round", () => {
    expect(plannedRecordings(rotation)).toHaveLength(9);
  });

  it("gives every participant one clip per round they talked in", () => {
    const recordings = plannedRecordings(rotation).map((p, i) =>
      recording({
        id: `r${i}`,
        round: p.round,
        roomIndex: p.roomIndex,
        participantA: p.participantA,
        participantB: p.participantB,
      })
    );
    for (const id of ids) {
      const clips = clipsForParticipant(recordings, id);
      expect(clips).toHaveLength(3);
      expect(clips.map((c) => c.round)).toEqual([1, 2, 3]);
    }
  });

  it("routes a 7-person session without claiming a sitting-out participant has a room", () => {
    const seven = [...ids, "p7"];
    const odd = generateRotation(seven, { rooms: 3, rounds: 3, seed: 20260711 });
    for (const plan of odd) {
      for (const id of plan.sittingOut) {
        expect(roomForParticipant(odd, plan.round, id)).toBeNull();
      }
      // Everyone else is in exactly one room.
      const placed = plan.dyads.flatMap((d) => [d.a, d.b]);
      expect(new Set(placed).size).toBe(placed.length);
    }
  });
});
