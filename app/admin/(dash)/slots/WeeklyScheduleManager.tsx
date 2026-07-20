"use client";

// The recurring weekly schedule: the fixed set of shifts the lab runs every
// week for the whole semester. RAs are assigned to these once (see the
// assignment grid); dated sessions are generated from them.

import { useRef, useState, useTransition } from "react";
import type { WeeklyShift } from "@/lib/types";
import { formatTimeRange } from "@/lib/format";
import { weekdayName } from "@/lib/schedule";
import {
  createWeeklyShiftAction,
  deleteWeeklyShiftAction,
  setWeeklyShiftActiveAction,
  setWeeklyShiftPreferredAction,
} from "../../actions";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon…Sun ordering

export default function WeeklyScheduleManager({ shifts }: { shifts: WeeklyShift[] }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const add = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createWeeklyShiftAction(formData);
      if (result.error) setError(result.error);
      else formRef.current?.reset();
    });
  };

  const remove = (shift: WeeklyShift) => {
    const ok = window.confirm(
      `Remove the ${weekdayName(shift.weekday)} ${formatTimeRange(
        shift.startTime,
        shift.endTime
      )} shift from the weekly schedule? Already-generated sessions stay; new ones won't be generated for it.`
    );
    if (!ok) return;
    startTransition(async () => {
      await deleteWeeklyShiftAction(shift.id);
    });
  };

  const byWeekday = new Map<number, WeeklyShift[]>();
  for (const s of shifts) {
    const list = byWeekday.get(s.weekday) ?? [];
    list.push(s);
    byWeekday.set(s.weekday, list);
  }

  return (
    <div className="space-y-5">
      <form ref={formRef} action={add} className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-2 sm:col-span-2">
          <label htmlFor="weekday" className="label">
            Day
          </label>
          <select id="weekday" name="weekday" required defaultValue="1" className="input">
            {WEEKDAYS.map((w) => (
              <option key={w} value={w}>
                {weekdayName(w)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="shiftStart" className="label">
            Start
          </label>
          <input id="shiftStart" name="startTime" type="time" required className="input" />
        </div>
        <div>
          <label htmlFor="shiftEnd" className="label">
            End
          </label>
          <input id="shiftEnd" name="endTime" type="time" required className="input" />
        </div>
        <div>
          <label htmlFor="roomCount" className="label">
            Rooms
          </label>
          <select id="roomCount" name="roomCount" defaultValue="3" className="input">
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={pending} className="btn-primary w-full">
            Add shift
          </button>
        </div>
        <label className="col-span-2 flex items-center gap-2 text-sm text-ink-soft sm:col-span-6">
          <input type="checkbox" name="preferred" className="h-4 w-4 accent-badger" />
          Mark as a preferred time (shown first to participants)
        </label>
      </form>

      {error && (
        <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}

      {shifts.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No weekly shifts yet. Add the times the lab runs sessions each week — the same
          schedule repeats all semester.
        </p>
      ) : (
        <div className="space-y-3">
          {[...byWeekday.entries()]
            .sort(([a], [b]) => ((a + 6) % 7) - ((b + 6) % 7))
            .map(([weekday, list]) => (
              <div key={weekday}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  {weekdayName(weekday as WeeklyShift["weekday"])}
                </h4>
                <ul className="flex flex-wrap gap-2">
                  {list
                    .slice()
                    .sort((a, b) => a.startTime.localeCompare(b.startTime))
                    .map((shift) => (
                      <li
                        key={shift.id}
                        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                          shift.active ? "border-line bg-white" : "border-line bg-stone-50 opacity-60"
                        }`}
                      >
                        <span className="font-medium">
                          {formatTimeRange(shift.startTime, shift.endTime)}
                        </span>
                        <span className="text-xs text-stone-400">
                          {shift.roomCount} room{shift.roomCount === 1 ? "" : "s"}
                        </span>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () =>
                              setWeeklyShiftPreferredAction(shift.id, !shift.preferred)
                            )
                          }
                          title={shift.preferred ? "Preferred time" : "Mark preferred"}
                          className={`text-base leading-none ${
                            shift.preferred ? "text-amber-500" : "text-stone-300 hover:text-amber-400"
                          }`}
                          aria-label={shift.preferred ? "Unmark preferred" : "Mark preferred"}
                        >
                          {shift.preferred ? "★" : "☆"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () =>
                              setWeeklyShiftActiveAction(shift.id, !shift.active)
                            )
                          }
                          className="text-xs font-semibold text-stone-400 hover:text-ink"
                        >
                          {shift.active ? "Pause" : "Resume"}
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(shift)}
                          className="text-xs font-semibold text-stone-400 hover:text-badger"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
