// Who is on which shift — pure view-model builders, no I/O.
//
// Reese, 2026-07-31: "Adding a more condensed schedule/calendar that could show
// which RAs are scheduled for which time slots. Something that is simpler and
// neater than the scheduler with availability, so RAs can see who is supposed to
// be in or a possible sub if they need someone to cover for them."
//
// The Schedule page's assignment grid answers "is this shift staffed?" — it is a
// grid of checkboxes built for setting things up. This answers the different
// question an RA has on a Tuesday morning: who am I working with, and who else
// knows this shift well enough to cover it. Same data, read the other way round.

import type { Ra, Slot, Weekday, WeeklyShift } from "./types";

/** Weekday order used everywhere RAs see a week: Monday first. */
const WEEK_ORDER: Weekday[] = [1, 2, 3, 4, 5, 6, 0];

function weekdayRank(weekday: Weekday): number {
  const index = WEEK_ORDER.indexOf(weekday);
  return index === -1 ? WEEK_ORDER.length : index;
}

export interface RosterPerson {
  id: string;
  name: string;
  email: string | null;
  isHead: boolean;
}

export interface RosterShift {
  shiftId: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  /** Head RA first, then alphabetical. */
  staff: RosterPerson[];
}

export interface RosterSession {
  slotId: string;
  date: string;
  startTime: string;
  endTime: string;
  staff: RosterPerson[];
}

/**
 * The standing weekly roster: every active shift with the active RAs assigned
 * to it. Shifts with nobody on them are kept — an empty row is exactly the row
 * someone needs to see.
 */
export function buildWeeklyRoster(
  shifts: readonly WeeklyShift[],
  ras: readonly Ra[],
  raShifts: ReadonlyArray<{ raId: string; shiftId: string; isHead: boolean }>
): RosterShift[] {
  const activeRas = new Map(ras.filter((r) => r.active).map((r) => [r.id, r]));

  const staffByShift = new Map<string, RosterPerson[]>();
  for (const { raId, shiftId, isHead } of raShifts) {
    const ra = activeRas.get(raId);
    if (!ra) continue;
    const list = staffByShift.get(shiftId) ?? [];
    list.push({ id: ra.id, name: ra.name, email: ra.email, isHead });
    staffByShift.set(shiftId, list);
  }

  for (const list of staffByShift.values()) {
    list.sort((a, b) =>
      a.isHead === b.isHead ? a.name.localeCompare(b.name) : a.isHead ? -1 : 1
    );
  }

  return shifts
    .filter((s) => s.active)
    .map((s) => ({
      shiftId: s.id,
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      staff: staffByShift.get(s.id) ?? [],
    }))
    .sort((a, b) =>
      a.weekday === b.weekday
        ? a.startTime.localeCompare(b.startTime)
        : weekdayRank(a.weekday) - weekdayRank(b.weekday)
    );
}

/**
 * The next `days` days of actual dated sessions, each carrying the staff of the
 * shift it came from. This is the part that accounts for reality: a week the
 * lab is closed has no rows, because the generator skipped those dates.
 *
 * `today` is included. Canceled sessions are dropped; one-off follow-ups are
 * kept even though they have no shift (they show with whatever per-slot
 * coverage exists, which may be nobody).
 */
export function upcomingSessions(
  slots: readonly Slot[],
  roster: readonly RosterShift[],
  today: string,
  days: number,
  extraStaffBySlot: ReadonlyMap<string, RosterPerson[]> = new Map()
): RosterSession[] {
  const staffByShift = new Map(roster.map((r) => [r.shiftId, r.staff]));
  const last = addDays(today, days - 1);

  return slots
    .filter((s) => s.status !== "canceled" && s.date >= today && s.date <= last)
    .map((s) => ({
      slotId: s.id,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      staff: mergeStaff(
        (s.shiftId ? staffByShift.get(s.shiftId) : undefined) ?? [],
        extraStaffBySlot.get(s.id) ?? []
      ),
    }))
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );
}

export interface SessionsAhead {
  sessions: RosterSession[];
  /** True when these are the sessions inside the window, false when they're the
   *  next few beyond it (over the summer, or a long break). */
  windowed: boolean;
}

/**
 * What to show under "what's coming up".
 *
 * Normally the next `days` days. Out of term that window is empty, and an empty
 * panel tells an RA nothing — so it falls back to the next `limit` sessions
 * whenever they are, and says so.
 */
export function sessionsAhead(
  slots: readonly Slot[],
  roster: readonly RosterShift[],
  today: string,
  days: number,
  limit: number,
  extraStaffBySlot: ReadonlyMap<string, RosterPerson[]> = new Map()
): SessionsAhead {
  const windowed = upcomingSessions(slots, roster, today, days, extraStaffBySlot);
  if (windowed.length > 0) return { sessions: windowed, windowed: true };

  // Far enough ahead to catch the start of next semester.
  const all = upcomingSessions(slots, roster, today, 400, extraStaffBySlot);
  return { sessions: all.slice(0, limit), windowed: false };
}

/** Union by person id; the shift's head flag wins over a per-slot entry. */
function mergeStaff(base: readonly RosterPerson[], extra: readonly RosterPerson[]): RosterPerson[] {
  const byId = new Map(base.map((p) => [p.id, p]));
  for (const person of extra) {
    if (!byId.has(person.id)) byId.set(person.id, person);
  }
  return [...byId.values()].sort((a, b) =>
    a.isHead === b.isHead ? a.name.localeCompare(b.name) : a.isHead ? -1 : 1
  );
}

/** Adds whole days to a "YYYY-MM-DD" Madison date, staying in local time. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(y, m - 1, d);
  day.setDate(day.getDate() + days);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
    day.getDate()
  ).padStart(2, "0")}`;
}
