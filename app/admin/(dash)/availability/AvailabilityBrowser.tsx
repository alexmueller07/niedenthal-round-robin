"use client";

// The availability page's two views: the whole team's coverage as one heat
// grid, and each RA's own week. Clicking a coverage cell lists who is free
// then; the name filter narrows both views at once.

import { useMemo, useState } from "react";
import {
  availabilityCellTimes,
  coverageByCell,
  totalHours,
  weeklyToPaint,
  type WeeklyBlock,
} from "@/lib/availability";
import { formatTime, formatTimeRange } from "@/lib/format";

export interface RaWeek {
  raId: string;
  name: string;
  submittedAt: string | null;
  blocks: WeeklyBlock[];
}

/** Monday first, the way the RA painter shows the week. */
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function shade(count: number, max: number): string {
  if (count === 0 || max === 0) return "transparent";
  // Badger red, stronger with more people free.
  const alpha = 0.15 + 0.7 * (count / max);
  return `rgba(197, 5, 12, ${alpha.toFixed(2)})`;
}

function submittedLabel(iso: string | null): string {
  if (!iso) return "hasn't responded";
  return `submitted ${new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  })}`;
}

export default function AvailabilityBrowser({ weeks }: { weeks: RaWeek[] }) {
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const times = useMemo(() => availabilityCellTimes(), []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? weeks.filter((w) => w.name.toLowerCase().includes(q)) : weeks;
  }, [weeks, filter]);

  const coverage = useMemo(() => coverageByCell(shown), [shown]);
  const nameById = useMemo(() => new Map(weeks.map((w) => [w.raId, w.name])), [weeks]);
  const max = Math.max(0, ...[...coverage.values()].map((l) => l.length));
  const responded = shown.filter((w) => w.submittedAt).length;

  const pickedNames = picked
    ? (coverage.get(picked) ?? []).map((id) => nameById.get(id) ?? id)
    : [];
  const [pickedDay, pickedTime] = picked ? picked.split("|") : ["", ""];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name"
          className="input max-w-xs"
          aria-label="Filter RAs by name"
        />
        <span className="text-sm text-ink-soft">
          {shown.length} RA{shown.length === 1 ? "" : "s"} · {responded} have submitted
        </span>
      </div>

      <section className="card overflow-x-auto p-6">
        <h2 className="font-semibold">Who is free when</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Darker means more RAs free. Click a cell to see who.
        </p>
        <table className="border-collapse text-xs">
          <thead>
            <tr>
              <th className="w-16" />
              {WEEKDAYS.map((w) => (
                <th key={w} className="w-16 pb-1 font-semibold">
                  {SHORT[w]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {times.map((time) => (
              <tr key={time}>
                <td className="pr-2 text-right text-ink-soft">
                  {time.endsWith(":00") ? formatTime(time) : ""}
                </td>
                {WEEKDAYS.map((w) => {
                  const key = `${w}|${time}`;
                  const count = coverage.get(key)?.length ?? 0;
                  return (
                    <td key={key} className="border border-line p-0">
                      <button
                        type="button"
                        onClick={() => setPicked(picked === key ? null : key)}
                        title={`${SHORT[w]} ${formatTime(time)}: ${count} free`}
                        className={`block h-5 w-16 text-[10px] ${
                          picked === key ? "outline outline-2 outline-ink" : ""
                        } ${count > max / 2 ? "text-white" : "text-ink"}`}
                        style={{ backgroundColor: shade(count, max) }}
                      >
                        {count > 0 ? count : ""}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        {picked && (
          <p className="mt-4 text-sm">
            <span className="font-semibold">
              {SHORT[Number(pickedDay)]} {formatTime(pickedTime)}:
            </span>{" "}
            {pickedNames.length === 0 ? "nobody" : pickedNames.join(", ")}
          </p>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {shown.map((week) => (
          <RaCard key={week.raId} week={week} />
        ))}
        {shown.length === 0 && (
          <p className="text-sm text-ink-soft">No active RAs match that filter.</p>
        )}
      </section>
    </div>
  );
}

function RaCard({ week }: { week: RaWeek }) {
  const hours = totalHours(weeklyToPaint(week.blocks));
  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">{week.name}</p>
        <span
          className={`chip ${
            week.submittedAt ? "bg-stone-100 text-ink-soft" : "bg-amber-50 text-amber-800"
          }`}
        >
          {submittedLabel(week.submittedAt)}
        </span>
      </div>
      {week.blocks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-soft">
          {week.submittedAt
            ? "No painted hours on record. (Anyone who submitted before 2026-10-13 only has their covered shifts saved — ask them to resubmit.)"
            : "Nothing entered yet."}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">{hours} h a week</p>
          <ul className="mt-3 space-y-1.5">
            {WEEKDAYS.filter((w) => week.blocks.some((b) => b.weekday === w)).map((w) => (
              <li key={w} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="w-10 shrink-0 font-semibold">{SHORT[w]}</span>
                {week.blocks
                  .filter((b) => b.weekday === w)
                  .map((b) => (
                    <span key={b.startTime} className="chip bg-badger-soft text-badger">
                      {formatTimeRange(b.startTime, b.endTime)}
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
