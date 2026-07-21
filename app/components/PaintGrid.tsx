"use client";

// Google-Calendar-style time painter: a row of columns with 30-minute cells.
// Press and drag to paint (or erase) blocks of time; works with mouse and touch
// via pointer events.
//
// Columns are generic, so this one component drives every painter in the app:
//   - the recurring weekly shift schedule (columns = Mon…Sun)
//   - RA availability (columns = Mon…Sun)
//   - dated session calendars (columns = dates, paged a week at a time)

import { useEffect, useMemo, useRef, useState } from "react";
import {
  blocksToCells,
  cellsToBlocks,
  minutesToTime,
  timeToMinutes,
  type PaintBlock,
} from "@/lib/availability";
import { formatTime } from "@/lib/format";

export const DAY_START = "09:00";
export const DAY_END = "21:00";
const CELL_MINUTES = 30;

export interface PaintColumn {
  /** Stable key stored in each block ("2026-09-08" or "1" for Monday). */
  key: string;
  /** Bold header line, e.g. "Mon". */
  label: string;
  /** Muted second header line, e.g. "Sep 8". */
  sublabel?: string;
}

interface PaintGridProps {
  columns: PaintColumn[];
  initialBlocks: PaintBlock[];
  onSelectionChange: (blocks: PaintBlock[], dirty: boolean) => void;
  /**
   * Show this many columns at a time with prev/next paging. Omit to show every
   * column at once (the weekly grid, which is only seven wide).
   */
  pageSize?: number;
  dayStart?: string;
  dayEnd?: string;
  /** Cells that are on but not editable here — e.g. what an RA offered. */
  hintCells?: ReadonlySet<string>;
}

export default function PaintGrid({
  columns,
  initialBlocks,
  onSelectionChange,
  pageSize,
  dayStart = DAY_START,
  dayEnd = DAY_END,
  hintCells,
}: PaintGridProps) {
  const [selected, setSelected] = useState<Set<string>>(() => blocksToCells(initialBlocks));
  const [page, setPage] = useState(0);
  // While dragging: true = painting, false = erasing.
  const paintMode = useRef<boolean | null>(null);

  const times = useMemo(() => {
    const list: string[] = [];
    for (let t = timeToMinutes(dayStart); t < timeToMinutes(dayEnd); t += CELL_MINUTES) {
      list.push(minutesToTime(t));
    }
    return list;
  }, [dayStart, dayEnd]);

  const pages = useMemo(() => {
    if (!pageSize || pageSize >= columns.length) return [columns];
    const chunks: PaintColumn[][] = [];
    for (let i = 0; i < columns.length; i += pageSize) {
      chunks.push(columns.slice(i, i + pageSize));
    }
    return chunks;
  }, [columns, pageSize]);

  const visible = pages[page] ?? pages[0] ?? [];
  const paged = pages.length > 1;

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

  const clearVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const col of visible) {
        for (const t of times) next.delete(`${col.key}|${t}`);
      }
      return next;
    });
  };

  return (
    <div onPointerUp={endPaint} onPointerLeave={endPaint} className="select-none">
      {paged && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="btn-ghost px-4 py-1.5 text-xs"
          >
            ← Earlier
          </button>
          <p className="text-sm font-semibold text-ink-soft">
            {visible.length > 0 &&
              `${visible[0].sublabel ?? visible[0].label} – ${
                visible[visible.length - 1].sublabel ?? visible[visible.length - 1].label
              }`}
            <span className="ml-2 font-normal text-stone-400">
              (page {page + 1} of {pages.length})
            </span>
          </p>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
            disabled={page >= pages.length - 1}
            className="btn-ghost px-4 py-1.5 text-xs"
          >
            Later →
          </button>
        </div>
      )}

      <div className="card overflow-x-auto p-3">
        <div
          className="grid min-w-[520px]"
          style={{
            gridTemplateColumns: `3.5rem repeat(${visible.length}, minmax(3rem, 1fr))`,
            touchAction: "none",
          }}
        >
          {/* header row */}
          <div />
          {visible.map((col) => (
            <div key={col.key} className="pb-2 text-center">
              <p className="text-xs font-bold uppercase tracking-wide">{col.label}</p>
              {col.sublabel && <p className="text-xs text-stone-400">{col.sublabel}</p>}
            </div>
          ))}

          {/* time rows */}
          {times.map((time) => (
            <div key={time} className="contents">
              <div className="relative -top-1.5 pr-2 text-right text-[10px] leading-none text-stone-400">
                {time.endsWith(":00") ? formatTime(time) : ""}
              </div>
              {visible.map((col) => {
                const key = `${col.key}|${time}`;
                const on = selected.has(key);
                const hinted = !on && hintCells?.has(key);
                const hourEdge = time.endsWith(":00");
                return (
                  <div
                    key={key}
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`${col.sublabel ?? col.label} ${time}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
                      handlePointerDown(key);
                    }}
                    onPointerEnter={() => handlePointerEnter(key)}
                    className={`h-5 cursor-pointer border-r border-line transition-colors first:border-l ${
                      hourEdge ? "border-t" : "border-t border-t-transparent"
                    } ${
                      on
                        ? "bg-badger hover:bg-badger-deep"
                        : hinted
                          ? "bg-badger/20 hover:bg-badger-soft"
                          : "bg-white hover:bg-badger-soft"
                    }`}
                  />
                );
              })}
            </div>
          ))}

          {/* bottom border */}
          <div />
          {visible.map((col) => (
            <div key={col.key} className="border-t border-line" />
          ))}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <p className="text-xs text-stone-400">
          Press and drag to paint · drag over painted cells to erase
        </p>
        <button
          type="button"
          onClick={clearVisible}
          className="text-xs font-semibold text-stone-400 hover:text-badger"
        >
          Clear {paged ? "this page" : "all"}
        </button>
      </div>
    </div>
  );
}
