"use client";

// Fixed RA-to-shift assignment for the semester. Each cell toggles whether an
// RA staffs a recurring shift; that assignment flows to every dated session
// generated from the shift.
//
// Layout note (Randy): the RA columns scroll horizontally once the team gets
// big, so Shift and Coverage are pinned to the left and stay visible. Coverage
// sits at index 1, right next to the time, because "is this shift OK?" is the
// question you're actually scanning for.

import { useTransition } from "react";
import type { Ra, WeeklyShift } from "@/lib/types";
import type { RaShift } from "@/lib/db";
import { formatTimeRange } from "@/lib/format";
import { weekdayName } from "@/lib/schedule";
import { clearShiftHeadAction, setShiftHeadAction, toggleRaShiftAction } from "../../actions";

interface ShiftAssignmentGridProps {
  shifts: WeeklyShift[];
  ras: Ra[];
  assignments: RaShift[];
  /** What RAs said they can staff — shown as a hint behind unassigned cells. */
  preferences: Array<{ raId: string; shiftId: string }>;
  minRas: number;
}

/** Widths of the two pinned columns; the second one's offset depends on the first. */
const SHIFT_COL = "11rem";
const COVER_COL = "8.5rem";

export default function ShiftAssignmentGrid({
  shifts,
  ras,
  assignments,
  preferences,
  minRas,
}: ShiftAssignmentGridProps) {
  const [pending, startTransition] = useTransition();

  const assigned = new Set(assignments.map((a) => `${a.raId}|${a.shiftId}`));
  const headByShift = new Map(
    assignments.filter((a) => a.isHead).map((a) => [a.shiftId, a.raId])
  );
  const offered = new Set(preferences.map((p) => `${p.raId}|${p.shiftId}`));
  const nameById = new Map(ras.map((r) => [r.id, r.name]));

  const toggle = (raId: string, shiftId: string) => {
    startTransition(async () => {
      await toggleRaShiftAction(raId, shiftId, !assigned.has(`${raId}|${shiftId}`));
    });
  };

  const toggleHead = (raId: string, shiftId: string) => {
    const isHead = headByShift.get(shiftId) === raId;
    startTransition(async () => {
      if (isHead) await clearShiftHeadAction(shiftId);
      else await setShiftHeadAction(raId, shiftId);
    });
  };

  const activeShifts = shifts
    .filter((s) => s.active)
    .sort((a, b) =>
      a.weekday === b.weekday
        ? a.startTime.localeCompare(b.startTime)
        : ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)
    );

  if (activeShifts.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-soft">
        Paint the weekly schedule above, then assign each RA to the shifts they cover for
        the semester.
      </div>
    );
  }

  if (ras.length === 0) {
    return (
      <div className="card p-6 text-sm text-amber-700">
        Add RAs on the People page, then come back to assign them to shifts.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="card max-h-[32rem] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left">
              <th
                className="sticky left-0 top-0 z-30 border-b border-r border-line bg-white p-4 font-semibold"
                style={{ width: SHIFT_COL, minWidth: SHIFT_COL }}
              >
                Shift
              </th>
              <th
                className="sticky top-0 z-30 border-b border-r-2 border-line bg-white p-4 text-center font-semibold shadow-[2px_0_4px_rgba(28,25,23,0.06)]"
                style={{ left: SHIFT_COL, width: COVER_COL, minWidth: COVER_COL }}
              >
                Coverage
              </th>
              {ras.map((ra) => (
                <th
                  key={ra.id}
                  className="sticky top-0 z-20 border-b border-line bg-white p-4 text-center font-semibold"
                  style={{ minWidth: "5rem" }}
                >
                  {ra.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeShifts.map((shift) => {
              const count = ras.filter((ra) => assigned.has(`${ra.id}|${shift.id}`)).length;
              const headId = headByShift.get(shift.id);
              const ready = count >= minRas && headId !== undefined;
              return (
                <tr key={shift.id} className="group">
                  <td
                    className="sticky left-0 z-10 border-b border-r border-line bg-white p-4 group-hover:bg-stone-50"
                    style={{ width: SHIFT_COL, minWidth: SHIFT_COL }}
                  >
                    <span className="font-medium">{weekdayName(shift.weekday)}</span>
                    {shift.preferred && (
                      <span className="ml-1.5 text-amber-500" title="Preferred time">
                        ★
                      </span>
                    )}
                    <span className="block text-xs text-ink-soft">
                      {formatTimeRange(shift.startTime, shift.endTime)}
                    </span>
                  </td>

                  <td
                    className="sticky z-10 border-b border-r-2 border-line bg-white p-4 text-center shadow-[2px_0_4px_rgba(28,25,23,0.06)] group-hover:bg-stone-50"
                    style={{ left: SHIFT_COL, width: COVER_COL, minWidth: COVER_COL }}
                  >
                    <span
                      className={`chip ${
                        ready ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {count}/{minRas}
                    </span>
                    <span className="mt-1 block text-xs">
                      {headId ? (
                        <span className="text-ink-soft">★ {nameById.get(headId)}</span>
                      ) : (
                        <span className="font-semibold text-amber-700">no head</span>
                      )}
                    </span>
                  </td>

                  {ras.map((ra) => {
                    const on = assigned.has(`${ra.id}|${shift.id}`);
                    const isHead = headId === ra.id;
                    const wants = offered.has(`${ra.id}|${shift.id}`);
                    return (
                      <td
                        key={ra.id}
                        className="border-b border-line p-2 text-center align-middle group-hover:bg-stone-50"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => toggle(ra.id, shift.id)}
                            aria-pressed={on}
                            aria-label={`${ra.name} staffs ${weekdayName(shift.weekday)} ${shift.startTime}`}
                            title={
                              wants && !on ? `${ra.name} said they're free for this` : undefined
                            }
                            className={`h-8 w-8 rounded-lg border text-xs font-bold transition-colors ${
                              on
                                ? "border-badger bg-badger text-white"
                                : wants
                                  ? "border-badger/40 bg-badger-soft text-badger/40 hover:border-badger"
                                  : "border-line bg-white text-transparent hover:border-stone-400"
                            }`}
                          >
                            ✓
                          </button>
                          {on && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleHead(ra.id, shift.id)}
                              aria-pressed={isHead}
                              aria-label={
                                isHead
                                  ? `Remove ${ra.name} as head RA`
                                  : `Make ${ra.name} head RA`
                              }
                              title={isHead ? "Head RA" : "Make head RA"}
                              className={`text-sm leading-none transition-colors ${
                                isHead ? "text-amber-500" : "text-stone-300 hover:text-amber-400"
                              }`}
                            >
                              {isHead ? "★" : "☆"}
                            </button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-stone-500">
        ✓ assigns an RA to a shift for the whole semester · ☆ marks the head RA (required —
        a shift without one will not be filled) · a tinted empty cell means that RA said
        they&apos;re free then.
      </p>
    </div>
  );
}
