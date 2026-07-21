// Semester slot generation — pure functions, no I/O. Turns the recurring
// weekly shift templates into concrete dated session slots across the semester
// window. Kept pure and unit-tested (lab rule: generation must be documented
// and reproducible).

import { coversRange, type PaintBlock } from "./availability";
import type { Weekday, WeeklyShift } from "./types";

/**
 * Which active shifts a painted weekly availability covers.
 *
 * RAs paint the hours they're free rather than ticking shift boxes, so this is
 * what turns "free Tuesday afternoon" into concrete shift ids. A shift counts
 * only when the paint spans all of it — being free for half a shift is no use
 * when staffing a session.
 */
export function shiftsCoveredBy(
  shifts: readonly WeeklyShift[],
  blocks: readonly PaintBlock[]
): WeeklyShift[] {
  return shifts.filter(
    (s) => s.active && coversRange(blocks, String(s.weekday), s.startTime, s.endTime)
  );
}

/** Parses "YYYY-MM-DD" into a local Date (never through UTC). */
function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Formats a local Date as "YYYY-MM-DD". */
function formatIso(day: Date): string {
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
    day.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Every date in [start, end] (inclusive) that falls on `weekday`, as
 * "YYYY-MM-DD" strings in chronological order.
 */
export function weekdayDatesBetween(
  start: string,
  end: string,
  weekday: Weekday
): string[] {
  const out: string[] = [];
  const startDay = parseDate(start);
  const endDay = parseDate(end);
  if (endDay < startDay) return out;

  const cursor = new Date(startDay);
  // Advance to the first matching weekday.
  const delta = (weekday - cursor.getDay() + 7) % 7;
  cursor.setDate(cursor.getDate() + delta);

  while (cursor <= endDay) {
    out.push(formatIso(cursor));
    cursor.setDate(cursor.getDate() + 7);
  }
  return out;
}

export interface GeneratedSlot {
  date: string;
  startTime: string;
  endTime: string;
  roomCount: number;
  preferred: boolean;
  shiftId: string;
}

/**
 * Expands active weekly shifts into dated slots across [start, end]. Inactive
 * shifts are skipped, as are any dates in `blackout` (holidays, breaks, finals).
 * Deterministic: sorted by date then start time so a caller can dedupe against
 * existing slots stably.
 */
export function generateShiftSlots(
  shifts: readonly WeeklyShift[],
  start: string,
  end: string,
  blackout: ReadonlySet<string> = new Set()
): GeneratedSlot[] {
  const out: GeneratedSlot[] = [];
  for (const shift of shifts) {
    if (!shift.active) continue;
    for (const date of weekdayDatesBetween(start, end, shift.weekday)) {
      if (blackout.has(date)) continue;
      out.push({
        date,
        startTime: shift.startTime,
        endTime: shift.endTime,
        roomCount: shift.roomCount,
        preferred: shift.preferred,
        shiftId: shift.id,
      });
    }
  }
  out.sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
  );
  return out;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function weekdayName(weekday: Weekday): string {
  return WEEKDAY_NAMES[weekday];
}
