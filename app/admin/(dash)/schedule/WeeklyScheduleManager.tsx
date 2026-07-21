"use client";

// The recurring weekly schedule: the fixed set of shifts the lab runs every
// week, all semester. RAs are assigned to these once (see the assignment
// grid); dated sessions are generated from them.
//
// Randy asked for this to stop being a form - "typing in times was super
// confusing". So you paint the week the same way participants paint
// availability, pick a session length, and save. The chips below the grid stay
// for the per-shift details that painting can't express (room count, whether a
// time is surfaced to participants first).

import { useMemo, useState, useTransition } from "react";
import type { PaintBlock } from "@/lib/availability";
import { splitIntoSessions } from "@/lib/availability";
import type { WeeklyShift } from "@/lib/types";
import { formatTimeRange } from "@/lib/format";
import { weekdayName } from "@/lib/schedule";
import PaintGrid, { type PaintColumn } from "@/app/components/PaintGrid";
import {
  setWeeklyScheduleAction,
  setWeeklyShiftActiveAction,
  setWeeklyShiftPreferredAction,
  setWeeklyShiftRoomsAction,
} from "../../actions";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const; // Mon…Sun ordering
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const COLUMNS: PaintColumn[] = WEEKDAYS.map((w) => ({
  key: String(w),
  label: SHORT[w],
}));

const LENGTHS = [
  { minutes: 60, label: "1 hour" },
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 150, label: "2.5 hours" },
  { minutes: 180, label: "3 hours" },
] as const;

/** The saved schedule, as paint. */
function shiftsToBlocks(shifts: readonly WeeklyShift[]): PaintBlock[] {
  return shifts
    .filter((s) => s.active)
    .map((s) => ({
      column: String(s.weekday),
      startTime: s.startTime,
      endTime: s.endTime,
    }));
}

export default function WeeklyScheduleManager({ shifts }: { shifts: WeeklyShift[] }) {
  const initialBlocks = useMemo(() => shiftsToBlocks(shifts), [shifts]);
  const [blocks, setBlocks] = useState<PaintBlock[]>(initialBlocks);
  const [dirty, setDirty] = useState(false);
  const [sessionMinutes, setSessionMinutes] = useState(120);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const planned = useMemo(
    () => splitIntoSessions(blocks, sessionMinutes),
    [blocks, sessionMinutes]
  );

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await setWeeklyScheduleAction(planned);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDirty(false);
      const bits: string[] = [];
      if (result.created > 0) bits.push(`${result.created} added`);
      if (result.retired > 0) bits.push(`${result.retired} retired`);
      setMessage(
        bits.length > 0 ? `Weekly schedule saved — ${bits.join(", ")}.` : "No changes."
      );
    });
  };

  const activeShifts = shifts.filter((s) => s.active);
  const pausedShifts = shifts.filter((s) => !s.active);

  const byWeekday = new Map<number, WeeklyShift[]>();
  for (const s of activeShifts) {
    const list = byWeekday.get(s.weekday) ?? [];
    list.push(s);
    byWeekday.set(s.weekday, list);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="sessionLength" className="text-sm font-medium text-ink-soft">
          Session length
        </label>
        <select
          id="sessionLength"
          value={sessionMinutes}
          onChange={(e) => setSessionMinutes(Number(e.target.value))}
          className="input w-36"
        >
          {LENGTHS.map((l) => (
            <option key={l.minutes} value={l.minutes}>
              {l.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-stone-500">
          Paint the hours the lab runs each week — each painted block is split into
          back-to-back sessions of this length.
        </p>
      </div>

      <PaintGrid
        columns={COLUMNS}
        initialBlocks={initialBlocks}
        onSelectionChange={(next) => {
          setBlocks(next);
          setDirty(true);
          setMessage(null);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-soft">
          {planned.length === 0 ? (
            "Nothing painted yet — drag across the grid to set the weekly hours."
          ) : (
            <>
              <span className="font-semibold text-ink">
                {planned.length} weekly shift{planned.length === 1 ? "" : "s"}
              </span>{" "}
              ={" "}
              {planned
                .slice(0, 3)
                .map(
                  (s) =>
                    `${SHORT[Number(s.column)]} ${formatTimeRange(s.startTime, s.endTime)}`
                )
                .join(" · ")}
              {planned.length > 3 && ` · +${planned.length - 3} more`}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="btn-primary"
        >
          {pending ? "Saving…" : "Save weekly schedule"}
        </button>
      </div>

      {message && (
        <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}

      {activeShifts.length > 0 && (
        <div className="space-y-3 border-t border-line pt-5">
          <p className="text-sm font-semibold">Shift details</p>
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
                        className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-medium">
                          {formatTimeRange(shift.startTime, shift.endTime)}
                        </span>
                        <label className="flex items-center gap-1 text-xs text-stone-500">
                          <select
                            value={shift.roomCount}
                            disabled={pending}
                            onChange={(e) =>
                              startTransition(async () => {
                                await setWeeklyShiftRoomsAction(
                                  shift.id,
                                  Number(e.target.value)
                                );
                              })
                            }
                            aria-label="Rooms"
                            className="rounded-lg border border-line bg-white px-1.5 py-0.5"
                          >
                            {[1, 2, 3].map((n) => (
                              <option key={n} value={n}>
                                {n}
                              </option>
                            ))}
                          </select>
                          rooms
                        </label>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            startTransition(async () => {
                              await setWeeklyShiftPreferredAction(shift.id, !shift.preferred);
                            })
                          }
                          title={shift.preferred ? "Preferred time" : "Mark preferred"}
                          className={`text-base leading-none ${
                            shift.preferred
                              ? "text-amber-500"
                              : "text-stone-300 hover:text-amber-400"
                          }`}
                          aria-label={
                            shift.preferred ? "Unmark preferred" : "Mark preferred"
                          }
                        >
                          {shift.preferred ? "★" : "☆"}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          <p className="text-xs text-stone-500">
            ★ shows a time to participants first. Rooms sets how many conversation rooms
            that shift runs.
          </p>
        </div>
      )}

      {pausedShifts.length > 0 && (
        <details className="border-t border-line pt-4 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-stone-400">
            {pausedShifts.length} retired shift{pausedShifts.length === 1 ? "" : "s"}
          </summary>
          <p className="mt-2 text-xs text-stone-500">
            Removed from the painted schedule. Sessions already generated from them stay
            put; no new ones are generated. Repaint that time to bring one back.
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {pausedShifts.map((shift) => (
              <li
                key={shift.id}
                className="flex items-center gap-2 rounded-xl border border-line bg-stone-50 px-3 py-1.5 text-xs text-stone-500"
              >
                {SHORT[shift.weekday]} {formatTimeRange(shift.startTime, shift.endTime)}
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await setWeeklyShiftActiveAction(shift.id, true);
                    })
                  }
                  className="font-semibold text-stone-400 hover:text-ink"
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
