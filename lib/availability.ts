// Painted time-block logic — pure functions shared by every drag painter in the
// app (weekly shift schedule, RA availability, admin session calendar).
//
// A block is anchored to a *column* rather than a date, so the same code serves
// both a dated calendar ("2026-09-08") and a recurring weekly grid ("1" = Monday,
// matching JS Date.getDay()). Times are "HH:MM" Madison wall-clock throughout.

export interface PaintBlock {
  /** Column the block sits in: a date "YYYY-MM-DD" or a weekday "0"–"6". */
  column: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM, exclusive
}

/**
 * A paint block whose column is a calendar date. Same shape as PaintBlock —
 * the alias documents intent at call sites that are date-specific.
 */
export type TimeBlock = PaintBlock;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Sorts and merges overlapping/adjacent blocks within each column. */
export function mergeBlocks(blocks: readonly PaintBlock[]): PaintBlock[] {
  const byColumn = new Map<string, Array<{ start: number; end: number }>>();
  for (const b of blocks) {
    const start = timeToMinutes(b.startTime);
    const end = timeToMinutes(b.endTime);
    if (end <= start) continue;
    const list = byColumn.get(b.column) ?? [];
    list.push({ start, end });
    byColumn.set(b.column, list);
  }

  const merged: PaintBlock[] = [];
  for (const [column, list] of [...byColumn.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    list.sort((a, b) => a.start - b.start);
    let current = list[0];
    for (const next of list.slice(1)) {
      if (next.start <= current.end) {
        current = { start: current.start, end: Math.max(current.end, next.end) };
      } else {
        merged.push({
          column,
          startTime: minutesToTime(current.start),
          endTime: minutesToTime(current.end),
        });
        current = next;
      }
    }
    merged.push({
      column,
      startTime: minutesToTime(current.start),
      endTime: minutesToTime(current.end),
    });
  }
  return merged;
}

/** True when the blocks fully cover [startTime, endTime) in the given column. */
export function coversRange(
  blocks: readonly PaintBlock[],
  column: string,
  startTime: string,
  endTime: string
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (const b of mergeBlocks(blocks.filter((x) => x.column === column))) {
    if (timeToMinutes(b.startTime) <= start && timeToMinutes(b.endTime) >= end) {
      return true;
    }
  }
  return false;
}

/** Total painted hours across all blocks. */
export function totalHours(blocks: readonly PaintBlock[]): number {
  const minutes = mergeBlocks(blocks).reduce(
    (sum, b) => sum + timeToMinutes(b.endTime) - timeToMinutes(b.startTime),
    0
  );
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Converts a set of selected 30-minute grid cells ("column|HH:MM") into merged
 * blocks — what a painter saves.
 */
export function cellsToBlocks(cells: ReadonlySet<string>, cellMinutes = 30): PaintBlock[] {
  const raw: PaintBlock[] = [];
  for (const cell of cells) {
    const [column, start] = cell.split("|");
    if (!column || !start) continue;
    raw.push({
      column,
      startTime: start,
      endTime: minutesToTime(timeToMinutes(start) + cellMinutes),
    });
  }
  return mergeBlocks(raw);
}

/**
 * Splits painted blocks into back-to-back sessions of `sessionMinutes`,
 * dropping any remainder too short for a full session. This is how a painted
 * schedule becomes concrete sessions.
 */
export function splitIntoSessions(
  blocks: readonly PaintBlock[],
  sessionMinutes: number
): PaintBlock[] {
  const sessions: PaintBlock[] = [];
  for (const b of mergeBlocks(blocks)) {
    for (
      let t = timeToMinutes(b.startTime);
      t + sessionMinutes <= timeToMinutes(b.endTime);
      t += sessionMinutes
    ) {
      sessions.push({
        column: b.column,
        startTime: minutesToTime(t),
        endTime: minutesToTime(t + sessionMinutes),
      });
    }
  }
  return sessions;
}

/** Expands blocks back into 30-minute cell keys for re-editing in a painter. */
export function blocksToCells(blocks: readonly PaintBlock[], cellMinutes = 30): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    for (
      let t = timeToMinutes(b.startTime);
      t + cellMinutes <= timeToMinutes(b.endTime);
      t += cellMinutes
    ) {
      cells.add(`${b.column}|${minutesToTime(t)}`);
    }
  }
  return cells;
}
