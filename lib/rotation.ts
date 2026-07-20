// Day-of room rotation ("rook problem") — pure, seeded, no I/O.
//
// A session's attendees are split into dyads across `rounds` conversation
// rounds and `rooms` rooms so that:
//   - nobody talks to the same partner twice (round-robin / circle method),
//   - people rotate rooms across rounds (nobody stuck in one room), and
//   - the whole thing is reproducible from the study seed (lab rule:
//     randomization must be documented and reproducible).
//
// The clean case is 6 attendees × 3 rooms × 3 rounds — everyone talks every
// round with three fresh partners. For 7–8 attendees there are more pairs than
// rooms, so one pair sits out each round on a rotating basis. The exact
// handling of >6 is flagged for Randy to verify against the protocol.

import { mulberry32 } from "./engine";
import type { Rotation } from "./types";

export type { Dyad, RoundPlan, Rotation } from "./types";

const BYE = "__bye__";

function seededShuffle<T>(items: readonly T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Circle-method round-robin: returns up to (n-1) rounds of perfect pairings
 * where no pair repeats. `players` must have even length.
 */
function roundRobinRounds(players: readonly string[]): Array<Array<[string, string]>> {
  const n = players.length;
  const arr = [...players];
  const rounds: Array<Array<[string, string]>> = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: Array<[string, string]> = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([arr[i], arr[n - 1 - i]]);
    }
    rounds.push(pairs);
    // Keep arr[0] fixed; rotate the rest one step.
    arr.splice(1, 0, arr[arr.length - 1]);
    arr.pop();
  }
  return rounds;
}

/** All permutations of [1..rooms], in a fixed (deterministic) order. */
function roomPermutations(rooms: number): number[][] {
  const base = Array.from({ length: rooms }, (_, i) => i + 1);
  const out: number[][] = [];
  const recurse = (chosen: number[], rest: number[]) => {
    if (rest.length === 0) {
      out.push(chosen);
      return;
    }
    for (let i = 0; i < rest.length; i++) {
      recurse([...chosen, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  recurse([], base);
  return out;
}

/**
 * Chooses a room permutation for every round at once. The primary objective is
 * the "rook" rule as the protocol states it — nobody in the same room in
 * consecutive rounds; total room spread (visiting as many distinct rooms as
 * possible) is a secondary tiebreak. Searches all combinations of per-round
 * permutations; for 3 rooms × 3 rounds that's only 6³ = 216 candidates.
 * Deterministic: ties break to the first combination in fixed order.
 */
function assignRoomsAcrossRounds(
  activePerRound: ReadonlyArray<ReadonlyArray<readonly [string, string]>>,
  rooms: number
): number[][] {
  const perms = roomPermutations(rooms);
  const rounds = activePerRound.length;
  const total = perms.length ** rounds;

  let best: number[][] = [];
  let bestScore = Infinity;

  for (let combo = 0; combo < total; combo++) {
    const assignment: number[][] = [];
    const roomByPersonRound = new Map<string, number[]>();
    let n = combo;
    for (let r = 0; r < rounds; r++) {
      const perm = perms[n % perms.length];
      n = Math.floor(n / perms.length);
      const dyads = activePerRound[r];
      const roomsForRound: number[] = [];
      for (let i = 0; i < dyads.length; i++) {
        const room = perm[i];
        roomsForRound.push(room);
        for (const person of dyads[i]) {
          const hist = roomByPersonRound.get(person) ?? [];
          hist[r] = room;
          roomByPersonRound.set(person, hist);
        }
      }
      assignment.push(roomsForRound);
    }

    let consecutive = 0;
    let totalRepeats = 0;
    for (const hist of roomByPersonRound.values()) {
      const seen = new Set<number>();
      let visits = 0;
      for (let r = 0; r < rounds; r++) {
        const room = hist[r];
        if (room === undefined) continue;
        visits++;
        seen.add(room);
        if (r > 0 && hist[r - 1] === room) consecutive++;
      }
      totalRepeats += visits - seen.size;
    }
    const score = consecutive * 1000 + totalRepeats; // consecutive dominates
    if (score < bestScore) {
      bestScore = score;
      best = assignment;
      if (score === 0) break;
    }
  }
  return best;
}

export interface RotationOptions {
  rooms: number;
  rounds: number;
  seed: number;
}

export function generateRotation(
  participantIds: readonly string[],
  { rooms, rounds, seed }: RotationOptions
): Rotation {
  const rand = mulberry32(seed);
  const shuffled = seededShuffle(participantIds, rand);

  // Odd count → add a phantom so the circle method pairs everyone; whoever
  // draws the phantom sits out that round.
  const players = shuffled.length % 2 === 0 ? shuffled : [...shuffled, BYE];
  const allRounds = roundRobinRounds(players);
  const usedRounds = Math.min(rounds, allRounds.length);

  const activePerRound: Array<Array<[string, string]>> = [];
  const sittingOutPerRound: string[][] = [];
  for (let r = 0; r < usedRounds; r++) {
    const realPairs = allRounds[r].filter(([a, b]) => a !== BYE && b !== BYE);
    const byePair = allRounds[r].find(([a, b]) => a === BYE || b === BYE);
    activePerRound.push(realPairs.slice(0, rooms));
    sittingOutPerRound.push([
      ...realPairs.slice(rooms).flat(),
      ...(byePair ? byePair.filter((x) => x !== BYE) : []),
    ]);
  }

  const roomAssignments = assignRoomsAcrossRounds(activePerRound, rooms);

  return activePerRound.map((active, r) => ({
    round: r + 1,
    dyads: active.map(([a, b], i) => ({ room: roomAssignments[r][i], a, b })),
    sittingOut: sittingOutPerRound[r],
  }));
}
