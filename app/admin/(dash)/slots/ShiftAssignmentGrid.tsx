"use client";

// Fixed RA-to-shift assignment for the semester. Each cell toggles whether an
// RA staffs a recurring shift; that assignment flows to every dated session
// generated from the shift. Coverage per shift must reach minRas before the
// scheduler will fill its sessions.

import { useTransition } from "react";
import type { Ra, WeeklyShift } from "@/lib/types";
import { formatTimeRange } from "@/lib/format";
import { weekdayName } from "@/lib/schedule";
import { toggleRaShiftAction } from "../../actions";

interface ShiftAssignmentGridProps {
  shifts: WeeklyShift[];
  ras: Ra[];
  assignments: Array<{ raId: string; shiftId: string }>;
  minRas: number;
}

export default function ShiftAssignmentGrid({
  shifts,
  ras,
  assignments,
  minRas,
}: ShiftAssignmentGridProps) {
  const [pending, startTransition] = useTransition();
  const set = new Set(assignments.map((a) => `${a.raId}|${a.shiftId}`));

  const toggle = (raId: string, shiftId: string) => {
    const assigned = set.has(`${raId}|${shiftId}`);
    startTransition(async () => {
      await toggleRaShiftAction(raId, shiftId, !assigned);
    });
  };

  const activeShifts = shifts
    .filter((s) => s.active)
    .sort((a, b) =>
      a.weekday === b.weekday
        ? a.startTime.localeCompare(b.startTime)
        : (a.weekday + 6) % 7 - ((b.weekday + 6) % 7)
    );

  if (activeShifts.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-soft">
        Add weekly shifts above, then assign each RA to the shifts they cover for the
        semester.
      </div>
    );
  }

  if (ras.length === 0) {
    return (
      <div className="card p-6 text-sm text-amber-700">
        Add RAs below, then come back to assign them to shifts.
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="p-4 font-semibold">Shift</th>
            {ras.map((ra) => (
              <th key={ra.id} className="p-4 text-center font-semibold">
                {ra.name}
              </th>
            ))}
            <th className="p-4 text-center font-semibold">Coverage</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {activeShifts.map((shift) => {
            const count = ras.filter((ra) => set.has(`${ra.id}|${shift.id}`)).length;
            const covered = count >= minRas;
            return (
              <tr key={shift.id}>
                <td className="p-4">
                  <span className="font-medium">{weekdayName(shift.weekday)}</span>
                  <span className="ml-2 text-ink-soft">
                    {formatTimeRange(shift.startTime, shift.endTime)}
                  </span>
                  {shift.preferred && (
                    <span className="ml-2 text-amber-500" title="Preferred time">
                      ★
                    </span>
                  )}
                </td>
                {ras.map((ra) => {
                  const on = set.has(`${ra.id}|${shift.id}`);
                  return (
                    <td key={ra.id} className="p-2 text-center">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(ra.id, shift.id)}
                        aria-pressed={on}
                        aria-label={`${ra.name} on ${weekdayName(shift.weekday)} ${shift.startTime}`}
                        className={`h-8 w-8 rounded-lg border text-xs font-bold transition-colors ${
                          on
                            ? "border-badger bg-badger text-white"
                            : "border-line bg-white text-transparent hover:border-stone-400"
                        }`}
                      >
                        ✓
                      </button>
                    </td>
                  );
                })}
                <td className="p-4 text-center">
                  <span
                    className={`chip ${
                      covered ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {count}/{minRas}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
