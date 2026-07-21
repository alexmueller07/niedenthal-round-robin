"use client";

// RA availability: paint the hours you're free each week; the app works out
// which of the lab's shifts that covers.
//
// RAs think in "I'm free Tuesday afternoons", not "I can staff shift #3", so
// the paint is the input and the shift list is the derived read-out. A shift
// only counts when the painted time covers the whole thing — half a shift is
// no use to Randy.

import { useMemo, useState, useTransition } from "react";
import type { PaintBlock } from "@/lib/availability";
import { formatTimeRange } from "@/lib/format";
import { shiftsCoveredBy, weekdayName } from "@/lib/schedule";
import type { WeeklyShift } from "@/lib/types";
import PaintGrid, { type PaintColumn } from "@/app/components/PaintGrid";
import { saveRaAvailability, signOutRa } from "./actions";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const COLUMNS: PaintColumn[] = WEEKDAYS.map((w) => ({
  key: String(w),
  label: SHORT[w],
}));

interface RaAvailabilityProps {
  raName: string;
  shifts: WeeklyShift[];
  /** Shift ids this RA previously submitted. */
  selectedShiftIds: string[];
  submittedAt: string | null;
}

/** The shifts an RA already offered, as paint they can adjust. */
function shiftsToBlocks(
  shifts: readonly WeeklyShift[],
  selected: ReadonlySet<string>
): PaintBlock[] {
  return shifts
    .filter((s) => selected.has(s.id))
    .map((s) => ({
      column: String(s.weekday),
      startTime: s.startTime,
      endTime: s.endTime,
    }));
}

export default function RaAvailability({
  raName,
  shifts,
  selectedShiftIds,
  submittedAt,
}: RaAvailabilityProps) {
  const active = useMemo(() => shifts.filter((s) => s.active), [shifts]);
  const initialBlocks = useMemo(
    () => shiftsToBlocks(active, new Set(selectedShiftIds)),
    [active, selectedShiftIds]
  );

  const [blocks, setBlocks] = useState<PaintBlock[]>(initialBlocks);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const covered = useMemo(() => shiftsCoveredBy(active, blocks), [active, blocks]);

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveRaAvailability(covered.map((s) => s.id));
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      setDirty(false);
      setMessage(
        covered.length === 0
          ? "Saved — you've told us you can't staff any shift right now."
          : `Saved — you can staff ${covered.length} shift${covered.length === 1 ? "" : "s"}.`
      );
    });
  };

  const byWeekday = new Map<number, WeeklyShift[]>();
  for (const s of covered) {
    const list = byWeekday.get(s.weekday) ?? [];
    list.push(s);
    byWeekday.set(s.weekday, list);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hi {raName}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Paint the hours you can work each week. The same schedule repeats all
            semester.
            {submittedAt && " You've submitted before — this shows what you sent."}
          </p>
        </div>
        <form action={signOutRa}>
          <button type="submit" className="btn-ghost px-4 py-2 text-xs">
            Sign out
          </button>
        </form>
      </header>

      {active.length === 0 ? (
        <div className="card p-6 text-sm text-ink-soft">
          The lab hasn&apos;t posted a weekly schedule yet. Check back once Randy sets
          the shift times.
        </div>
      ) : (
        <>
          <PaintGrid
            columns={COLUMNS}
            initialBlocks={initialBlocks}
            onSelectionChange={(next) => {
              setBlocks(next);
              setDirty(true);
              setMessage(null);
            }}
          />

          <div className="card p-5">
            <p className="font-semibold">
              {covered.length === 0
                ? "No shifts covered yet"
                : `You can staff ${covered.length} shift${covered.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              A shift counts only when you&apos;re free for all of it. Paint a bit wider
              if one you expected is missing.
            </p>

            {covered.length > 0 && (
              <ul className="mt-4 space-y-2">
                {[...byWeekday.entries()]
                  .sort(([a], [b]) => ((a + 6) % 7) - ((b + 6) % 7))
                  .map(([weekday, list]) => (
                    <li key={weekday} className="flex flex-wrap items-baseline gap-2">
                      <span className="w-24 shrink-0 text-sm font-semibold">
                        {weekdayName(weekday as WeeklyShift["weekday"])}
                      </span>
                      {list
                        .slice()
                        .sort((a, b) => a.startTime.localeCompare(b.startTime))
                        .map((s) => (
                          <span key={s.id} className="chip bg-badger-soft text-badger">
                            {formatTimeRange(s.startTime, s.endTime)}
                          </span>
                        ))}
                    </li>
                  ))}
              </ul>
            )}

            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="btn-primary mt-5"
            >
              {pending ? "Saving…" : "Submit availability"}
            </button>

            {message && (
              <p className="mt-3 rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
                {message}
              </p>
            )}
            {error && (
              <p className="mt-3 rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">
                {error}
              </p>
            )}
          </div>

          <p className="text-xs text-stone-500">
            This is your availability, not your assignment — Randy still sets who staffs
            what. Email him for a one-off swap.
          </p>
        </>
      )}
    </div>
  );
}
