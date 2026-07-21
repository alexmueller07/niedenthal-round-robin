"use client";

// Drag-calendar slot creation: paint blocks of time, pick a session length,
// and each painted block is split into back-to-back session slots.

import { useMemo, useState, useTransition } from "react";
import { splitIntoSessions, type TimeBlock } from "@/lib/availability";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import PaintGrid, { type PaintColumn } from "@/app/components/PaintGrid";
import { createSlotsFromBlocksAction } from "../../actions";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

function dateColumn(date: string): PaintColumn {
  const [y, m, d] = date.split("-").map(Number);
  return {
    key: date,
    label: WEEKDAY_SHORT[new Date(y, m - 1, d).getDay()],
    sublabel: `${MONTH_SHORT[m - 1]} ${d}`,
  };
}

const LENGTHS = [
  { minutes: 90, label: "1.5 hours" },
  { minutes: 120, label: "2 hours" },
  { minutes: 150, label: "2.5 hours" },
  { minutes: 180, label: "3 hours" },
] as const;

export default function SlotCalendarCreate({ dates }: { dates: string[] }) {
  const [blocks, setBlocks] = useState<TimeBlock[]>([]);
  const [sessionMinutes, setSessionMinutes] = useState(120);
  const [message, setMessage] = useState<string | null>(null);
  const [gridKey, setGridKey] = useState(0);
  const [pending, startTransition] = useTransition();

  const sessions = useMemo(
    () => splitIntoSessions(blocks, sessionMinutes),
    [blocks, sessionMinutes]
  );

  const create = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await createSlotsFromBlocksAction(blocks, sessionMinutes);
      if (result.error) {
        setMessage(result.error);
      } else {
        setMessage(`Created ${result.created} slot${result.created === 1 ? "" : "s"}.`);
        setBlocks([]);
        setGridKey((k) => k + 1); // reset the grid paint
      }
    });
  };

  return (
    <div className="space-y-4">
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
          Paint when the lab can run sessions — each painted block is split into
          back-to-back sessions of this length.
        </p>
      </div>

      <PaintGrid
        key={gridKey}
        columns={dates.map(dateColumn)}
        pageSize={7}
        initialBlocks={[]}
        onSelectionChange={(next) => {
          setBlocks(next);
          setMessage(null);
        }}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-soft">
          {sessions.length === 0 ? (
            "No full sessions painted yet."
          ) : (
            <>
              <span className="font-semibold text-ink">
                {sessions.length} slot{sessions.length === 1 ? "" : "s"}
              </span>{" "}
              ready:{" "}
              {sessions
                .slice(0, 4)
                .map((s) => `${formatDateShort(s.column)} ${formatTimeRange(s.startTime, s.endTime)}`)
                .join(" · ")}
              {sessions.length > 4 && ` · +${sessions.length - 4} more`}
            </>
          )}
        </div>
        <button
          type="button"
          onClick={create}
          disabled={pending || sessions.length === 0}
          className="btn-primary"
        >
          {pending
            ? "Creating…"
            : `Create ${sessions.length || ""} slot${sessions.length === 1 ? "" : "s"}`}
        </button>
      </div>
      {message && <p className="text-sm text-ink-soft">{message}</p>}
    </div>
  );
}
