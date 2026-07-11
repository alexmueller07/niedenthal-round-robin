"use client";

// Google-Calendar-style availability painter: a week of day columns with
// 30-minute cells. Press and drag to paint (or erase) blocks of free time;
// works with mouse and touch via pointer events.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  blocksToCells,
  cellsToBlocks,
  minutesToTime,
  timeToMinutes,
  type TimeBlock,
} from "@/lib/availability";
import { formatTime } from "@/lib/format";

export const DAY_START = "09:00";
export const DAY_END = "21:00";
const CELL_MINUTES = 30;

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

interface AvailabilityGridProps {
  /** All selectable dates ("YYYY-MM-DD"), chronological. */
  dates: string[];
  initialBlocks: TimeBlock[];
  onSelectionChange: (blocks: TimeBlock[], dirty: boolean) => void;
}

function dayLabel(date: string): { weekday: string; day: string } {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return { weekday: WEEKDAY_SHORT[dt.getDay()], day: `${MONTH_SHORT[m - 1]} ${d}` };
}

export default function AvailabilityGrid({
  dates,
  initialBlocks,
  onSelectionChange,
}: AvailabilityGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => blocksToCells(initialBlocks));
  const [week, setWeek] = useState(0);
  // While dragging: true = painting, false = erasing.
  const paintMode = useRef<boolean | null>(null);

  const times = useMemo(() => {
    const list: string[] = [];
    for (let t = timeToMinutes(DAY_START); t < timeToMinutes(DAY_END); t += CELL_MINUTES) {
      list.push(minutesToTime(t));
    }
    return list;
  }, []);

  const weeks = useMemo(() => {
    const chunks: string[][] = [];
    for (let i = 0; i < dates.length; i += 7) chunks.push(dates.slice(i, i + 7));
    return chunks;
  }, [dates]);

  const visibleDates = weeks[week] ?? [];

  // Notify the parent after commit — never during another component's render.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onSelectionChange(cellsToBlocks(selected), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on selection changes only
  }, [selected]);

  const applyCell = (key: string, mode: boolean) => {
    setSelected((prev) => {
      if (prev.has(key) === mode) return prev;
      const next = new Set(prev);
      if (mode) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const handlePointerDown = (key: string) => {
    const mode = !selected.has(key);
    paintMode.current = mode;
    applyCell(key, mode);
  };

  const handlePointerEnter = (key: string) => {
    if (paintMode.current !== null) applyCell(key, paintMode.current);
  };

  const endPaint = () => {
    paintMode.current = null;
  };

  const clearWeek = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const date of visibleDates) {
        for (const t of times) next.delete(`${date}|${t}`);
      }
      return next;
    });
  };

  return (
    <div
      onPointerUp={endPaint}
      onPointerLeave={endPaint}
      className="select-none"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setWeek((w) => Math.max(0, w - 1))}
          disabled={week === 0}
          className="btn-ghost px-4 py-1.5 text-xs"
        >
          ← Earlier
        </button>
        <p className="text-sm font-semibold text-ink-soft">
          {visibleDates.length > 0 &&
            `${dayLabel(visibleDates[0]).day} – ${dayLabel(visibleDates[visibleDates.length - 1]).day}`}
          <span className="ml-2 font-normal text-stone-400">
            (week {week + 1} of {weeks.length})
          </span>
        </p>
        <button
          type="button"
          onClick={() => setWeek((w) => Math.min(weeks.length - 1, w + 1))}
          disabled={week >= weeks.length - 1}
          className="btn-ghost px-4 py-1.5 text-xs"
        >
          Later →
        </button>
      </div>

      <div className="card overflow-x-auto p-3">
        <div
          className="grid min-w-[520px]"
          style={{
            gridTemplateColumns: `3.5rem repeat(${visibleDates.length}, minmax(3rem, 1fr))`,
            touchAction: "none",
          }}
        >
          {/* header row */}
          <div />
          {visibleDates.map((date) => {
            const { weekday, day } = dayLabel(date);
            return (
              <div key={date} className="pb-2 text-center">
                <p className="text-xs font-bold uppercase tracking-wide">{weekday}</p>
                <p className="text-xs text-stone-400">{day}</p>
              </div>
            );
          })}

          {/* time rows */}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className="relative -top-1.5 pr-2 text-right text-[10px] leading-none text-stone-400">
                {time.endsWith(":00") ? formatTime(time) : ""}
              </div>
              {visibleDates.map((date) => {
                const key = `${date}|${time}`;
                const on = selected.has(key);
                const hourEdge = time.endsWith(":00");
                return (
                  <div
                    key={key}
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${date} ${time}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                      handlePointerDown(key);
                    }}
                    onPointerEnter={() => handlePointerEnter(key)}
                    className={`h-5 cursor-pointer border-r border-line transition-colors first:border-l ${
                      hourEdge ? "border-t" : "border-t border-t-transparent"
                    } ${on ? "bg-badger hover:bg-badger-deep" : "bg-white hover:bg-badger-soft"}`}
                  />
                );
              })}
            </div>
          ))}

          {/* bottom border */}
          <div />
          {visibleDates.map((date) => (
            <div key={date} className="border-t border-line" />
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-stone-400">
          Press and drag to mark free time · drag over marked cells to erase
        </p>
        <button
          type="button"
          onClick={clearWeek}
          className="text-xs font-semibold text-stone-400 hover:text-badger"
        >
          Clear this week
        </button>
      </div>
    </div>
  );
}
