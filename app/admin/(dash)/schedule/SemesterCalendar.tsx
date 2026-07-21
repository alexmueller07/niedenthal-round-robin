"use client";

// Month-by-month view of the semester: which days have generated sessions, and
// which days the lab is skipping. Click a day to black it out (holidays,
// breaks, finals) or to bring it back.
//
// This is also how sessions get deleted, which was the other half of Randy's
// complaint - blacking out a day removes what was generated on it. Empty
// sessions are deleted outright; ones with participants are canceled so those
// people get an email instead of quietly losing their session.

import { useMemo, useState, useTransition } from "react";
import type { BlackoutDate, Slot } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { addBlackoutDateAction, removeBlackoutDateAction } from "../../actions";

interface SemesterCalendarProps {
  semesterStart: string;
  semesterEnd: string;
  blackoutDates: BlackoutDate[];
  /** Generated sessions in the window, for the per-day counts. */
  sessions: Array<Pick<Slot, "id" | "date">>;
  /** Session ids that have live or attended assignments. */
  sessionsWithPeople: string[];
  today: string;
}

const WEEKDAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Every (year, month) touched by the semester window. */
function monthsBetween(start: string, end: string): Array<{ year: number; month: number }> {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  const out: Array<{ year: number; month: number }> = [];
  let y = sy;
  let m = sm - 1;
  while (y < ey || (y === ey && m <= em - 1)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return out;
}

export default function SemesterCalendar({
  semesterStart,
  semesterEnd,
  blackoutDates,
  sessions,
  sessionsWithPeople,
  today,
}: SemesterCalendarProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const blackout = new Map(blackoutDates.map((b) => [b.date, b.label]));
  const peopleSet = new Set(sessionsWithPeople);

  const byDate = useMemo(() => {
    const map = new Map<string, { total: number; withPeople: number }>();
    for (const s of sessions) {
      const entry = map.get(s.date) ?? { total: 0, withPeople: 0 };
      entry.total += 1;
      if (peopleSet.has(s.id)) entry.withPeople += 1;
      map.set(s.date, entry);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- peopleSet is derived from props
  }, [sessions, sessionsWithPeople]);

  const months = useMemo(
    () => monthsBetween(semesterStart, semesterEnd),
    [semesterStart, semesterEnd]
  );

  const toggle = (date: string) => {
    setMessage(null);

    if (blackout.has(date)) {
      startTransition(async () => {
        await removeBlackoutDateAction(date);
        setMessage(`${formatDate(date)} is back on the schedule — regenerate to fill it.`);
      });
      return;
    }

    const counts = byDate.get(date);
    if (counts && counts.total > 0) {
      const warning =
        counts.withPeople > 0
          ? `\n\n${counts.withPeople} of them ${counts.withPeople === 1 ? "has" : "have"} participants — they will be emailed a cancellation and re-queued.`
          : "";
      const ok = window.confirm(
        `Skip ${formatDate(date)}?\n\nThis removes ${counts.total} generated session${
          counts.total === 1 ? "" : "s"
        } on that day.${warning}`
      );
      if (!ok) return;
    }

    startTransition(async () => {
      const result = await addBlackoutDateAction(date);
      if (result.error) {
        setMessage(result.error);
        return;
      }
      const bits: string[] = [];
      if (result.deleted > 0) bits.push(`${result.deleted} deleted`);
      if (result.canceled > 0) bits.push(`${result.canceled} canceled and emailed`);
      setMessage(
        bits.length > 0
          ? `${formatDate(date)} skipped — ${bits.join(", ")}.`
          : `${formatDate(date)} skipped.`
      );
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {months.map(({ year, month }) => {
          const firstDay = new Date(year, month, 1).getDay();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          return (
            <div key={`${year}-${month}`}>
              <p className="mb-2 text-sm font-bold">
                {MONTH_NAMES[month]} {year}
              </p>
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAY_INITIALS.map((d, i) => (
                  <div
                    key={i}
                    className="pb-1 text-center text-[10px] font-semibold uppercase text-stone-400"
                  >
                    {d}
                  </div>
                ))}
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const day = i + 1;
                  const date = iso(year, month, day);
                  const inWindow = date >= semesterStart && date <= semesterEnd;
                  const isBlackout = blackout.has(date);
                  const counts = byDate.get(date);
                  const hasSessions = (counts?.total ?? 0) > 0;
                  const isToday = date === today;

                  if (!inWindow) {
                    return (
                      <div
                        key={date}
                        className="flex h-8 items-center justify-center text-xs text-stone-300"
                      >
                        {day}
                      </div>
                    );
                  }

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(date)}
                      title={
                        isBlackout
                          ? `${formatDate(date)} — skipped. Click to restore.`
                          : hasSessions
                            ? `${formatDate(date)} — ${counts!.total} session${counts!.total === 1 ? "" : "s"}. Click to skip.`
                            : `${formatDate(date)} — click to skip.`
                      }
                      className={`relative flex h-8 items-center justify-center rounded-lg text-xs transition-colors ${
                        isBlackout
                          ? "bg-stone-200 text-stone-400 line-through hover:bg-stone-300"
                          : hasSessions
                            ? "bg-badger-soft font-semibold text-badger hover:bg-badger hover:text-white"
                            : "text-ink-soft hover:bg-stone-100"
                      } ${isToday ? "ring-2 ring-inset ring-ink" : ""}`}
                    >
                      {day}
                      {hasSessions && !isBlackout && (
                        <span className="absolute bottom-0.5 text-[8px] leading-none">
                          {"•".repeat(Math.min(3, counts!.total))}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-badger-soft" /> has sessions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-stone-200" /> skipped
        </span>
        <span>Click any day to skip it or bring it back.</span>
      </div>

      {message && (
        <p className="rounded-xl bg-stone-100 px-4 py-2.5 text-sm text-ink-soft">{message}</p>
      )}
    </div>
  );
}
