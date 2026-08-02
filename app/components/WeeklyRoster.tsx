// The "who's in" view. Read-only on purpose.
//
// Reese asked for something simpler and neater than the assignment grid, so an
// RA can see who they're working with and who could cover a shift. Two blocks:
// the standing week, and the actual dated sessions coming up. Nothing here is
// editable — the Schedule page is where staffing is set, and mixing the two
// would make this the same busy screen it exists to replace.

import { formatDateShort, formatTimeRange } from "@/lib/format";
import type { RosterPerson, RosterSession, RosterShift } from "@/lib/roster";
import { weekdayName } from "@/lib/schedule";

interface WeeklyRosterProps {
  roster: RosterShift[];
  upcoming: RosterSession[];
  /** False when `upcoming` is the next few sessions rather than the next 2 weeks. */
  upcomingIsWindowed: boolean;
  /** How many RAs a shift is supposed to have; below it, the row is flagged. */
  minRas: number;
  /** The signed-in RA, highlighted throughout. Omit on the admin view. */
  currentRaId?: string;
  /** Today in Madison, so "today" can be called out in the upcoming list. */
  today: string;
}

function Person({ person, isYou }: { person: RosterPerson; isYou: boolean }) {
  const body = (
    <>
      {person.isHead && (
        <span className="text-amber-500" title="Head RA">
          ★
        </span>
      )}
      {person.name}
      {isYou && <span className="text-ink-soft"> (you)</span>}
    </>
  );

  // Mailing someone is the whole point of the list when you need a sub, so the
  // name is the mail link wherever we have an address.
  return person.email ? (
    <a
      href={`mailto:${person.email}`}
      title={`Email ${person.name} — ${person.email}`}
      className={`chip transition-colors ${
        isYou
          ? "bg-badger-soft text-badger hover:bg-red-100"
          : "bg-stone-100 text-ink hover:bg-stone-200"
      }`}
    >
      {body}
    </a>
  ) : (
    <span
      className={`chip ${isYou ? "bg-badger-soft text-badger" : "bg-stone-100 text-ink"}`}
    >
      {body}
    </span>
  );
}

function StaffList({
  staff,
  currentRaId,
  emptyText,
}: {
  staff: RosterPerson[];
  currentRaId?: string;
  emptyText: string;
}) {
  if (staff.length === 0) {
    return <span className="text-sm text-amber-700">{emptyText}</span>;
  }
  return (
    <span className="flex flex-wrap gap-1.5">
      {staff.map((person) => (
        <Person key={person.id} person={person} isYou={person.id === currentRaId} />
      ))}
    </span>
  );
}

export default function WeeklyRoster({
  roster,
  upcoming,
  upcomingIsWindowed,
  minRas,
  currentRaId,
  today,
}: WeeklyRosterProps) {
  if (roster.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-soft">
        No weekly shifts posted yet. Once Randy paints the schedule, who&apos;s working
        when shows up here.
      </div>
    );
  }

  // Group by weekday so the week reads as a week, not as a flat list of rows.
  const byWeekday: Array<{ weekday: RosterShift["weekday"]; shifts: RosterShift[] }> = [];
  for (const shift of roster) {
    const last = byWeekday[byWeekday.length - 1];
    if (last && last.weekday === shift.weekday) last.shifts.push(shift);
    else byWeekday.push({ weekday: shift.weekday, shifts: [shift] });
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-bold">Every week</h2>
        <p className="mb-3 text-sm text-ink-soft">
          The standing roster. ★ is the head RA for that shift. Click a name to email
          them — that&apos;s the fastest way to find cover.
        </p>

        <div className="card divide-y divide-line">
          {byWeekday.map(({ weekday, shifts }) => (
            <div key={weekday} className="flex flex-col gap-2 p-4 sm:flex-row sm:gap-4">
              <div className="w-28 shrink-0 pt-0.5 font-semibold">
                {weekdayName(weekday)}
              </div>
              <div className="flex-1 space-y-3">
                {shifts.map((shift) => (
                  <div
                    key={shift.shiftId}
                    className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4"
                  >
                    <div className="w-36 shrink-0 text-sm text-ink-soft">
                      {formatTimeRange(shift.startTime, shift.endTime)}
                    </div>
                    <div className="flex-1">
                      <StaffList
                        staff={shift.staff}
                        currentRaId={currentRaId}
                        emptyText="nobody assigned yet"
                      />
                      {shift.staff.length > 0 && shift.staff.length < minRas && (
                        <p className="mt-1 text-xs text-amber-700">
                          {shift.staff.length} of {minRas} RAs
                        </p>
                      )}
                      {shift.staff.length > 0 && !shift.staff.some((p) => p.isHead) && (
                        <p className="mt-1 text-xs text-amber-700">no head RA</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">
          {upcomingIsWindowed ? "Next two weeks" : "Next sessions"}
        </h2>
        <p className="mb-3 text-sm text-ink-soft">
          {upcomingIsWindowed
            ? "The actual sessions on the calendar. Days the lab is closed are already missing from this list."
            : "Nothing in the next two weeks — these are the next sessions on the calendar."}
        </p>

        {upcoming.length === 0 ? (
          <div className="card p-6 text-sm text-ink-soft">
            No sessions on the calendar yet. They appear once the semester is
            published on the Schedule page.
          </div>
        ) : (
          <div className="card divide-y divide-line">
            {upcoming.map((session) => (
              <div
                key={session.slotId}
                className="flex flex-col gap-1.5 p-4 sm:flex-row sm:items-start sm:gap-4"
              >
                <div className="w-28 shrink-0 font-semibold">
                  {formatDateShort(session.date)}
                  {session.date === today && (
                    <span className="ml-2 chip bg-badger text-white">today</span>
                  )}
                </div>
                <div className="w-36 shrink-0 text-sm text-ink-soft">
                  {formatTimeRange(session.startTime, session.endTime)}
                </div>
                <div className="flex-1">
                  <StaffList
                    staff={session.staff}
                    currentRaId={currentRaId}
                    emptyText="not staffed"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
