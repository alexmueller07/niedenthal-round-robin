// Availability time-block logic — pure functions shared by the portal grid,
// the snapshot builder, and the suggested-times panel.
//
// Participants paint free-form blocks on a calendar ("HH:MM" wall-clock,
// "YYYY-MM-DD" dates). A participant can attend a session slot only when
// their painted blocks fully cover the slot's time range on that date.

export interface TimeBlock {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM, exclusive
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Sorts and merges overlapping/adjacent blocks within each date. */
export function mergeBlocks(blocks: readonly TimeBlock[]): TimeBlock[] {
  const byDate = new Map<string, Array<{ start: number; end: number }>>();
  for (const b of blocks) {
    const start = timeToMinutes(b.startTime);
    const end = timeToMinutes(b.endTime);
    if (end <= start) continue;
    const list = byDate.get(b.date) ?? [];
    list.push({ start, end });
    byDate.set(b.date, list);
  }

  const merged: TimeBlock[] = [];
  for (const [date, list] of [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    list.sort((a, b) => a.start - b.start);
    let current = list[0];
    for (const next of list.slice(1)) {
      if (next.start <= current.end) {
        current = { start: current.start, end: Math.max(current.end, next.end) };
      } else {
        merged.push({ date, startTime: minutesToTime(current.start), endTime: minutesToTime(current.end) });
        current = next;
      }
    }
    merged.push({ date, startTime: minutesToTime(current.start), endTime: minutesToTime(current.end) });
  }
  return merged;
}

/** True when the blocks fully cover [startTime, endTime) on the given date. */
export function coversRange(
  blocks: readonly TimeBlock[],
  date: string,
  startTime: string,
  endTime: string
): boolean {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (const b of mergeBlocks(blocks.filter((x) => x.date === date))) {
    if (timeToMinutes(b.startTime) <= start && timeToMinutes(b.endTime) >= end) {
      return true;
    }
  }
  return false;
}

/** Total painted hours across all blocks (for the participants table). */
export function totalHours(blocks: readonly TimeBlock[]): number {
  const minutes = mergeBlocks(blocks).reduce(
    (sum, b) => sum + timeToMinutes(b.endTime) - timeToMinutes(b.startTime),
    0
  );
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * Converts a set of selected 30-minute grid cells ("date|HH:MM") into merged
 * blocks — what the portal grid saves.
 */
export function cellsToBlocks(cells: ReadonlySet<string>, cellMinutes = 30): TimeBlock[] {
  const raw: TimeBlock[] = [];
  for (const cell of cells) {
    const [date, start] = cell.split("|");
    if (!date || !start) continue;
    raw.push({
      date,
      startTime: start,
      endTime: minutesToTime(timeToMinutes(start) + cellMinutes),
    });
  }
  return mergeBlocks(raw);
}

/**
 * Splits painted blocks into back-to-back sessions of `sessionMinutes`,
 * dropping any remainder too short for a full session. This is how the admin
 * drag calendar turns painted time into concrete session slots.
 */
export function splitIntoSessions(
  blocks: readonly TimeBlock[],
  sessionMinutes: number
): TimeBlock[] {
  const sessions: TimeBlock[] = [];
  for (const b of mergeBlocks(blocks)) {
    for (
      let t = timeToMinutes(b.startTime);
      t + sessionMinutes <= timeToMinutes(b.endTime);
      t += sessionMinutes
    ) {
      sessions.push({
        date: b.date,
        startTime: minutesToTime(t),
        endTime: minutesToTime(t + sessionMinutes),
      });
    }
  }
  return sessions;
}

/** Expands blocks back into 30-minute cell keys for re-editing in the grid. */
export function blocksToCells(blocks: readonly TimeBlock[], cellMinutes = 30): Set<string> {
  const cells = new Set<string>();
  for (const b of blocks) {
    for (
      let t = timeToMinutes(b.startTime);
      t + cellMinutes <= timeToMinutes(b.endTime);
      t += cellMinutes
    ) {
      cells.add(`${b.date}|${minutesToTime(t)}`);
    }
  }
  return cells;
}
