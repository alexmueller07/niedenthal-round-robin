"use client";

// Sessions × RAs coverage grid for follow-up sessions, which sit outside the
// weekly schedule and so can't inherit staffing from a shift.
//
// Same pinned-column treatment as the shift grid: Session and Coverage stay
// put while the RA columns scroll.

import Link from "next/link";
import { useTransition } from "react";
import type { Ra, Slot } from "@/lib/types";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import {
  cancelSlotAction,
  setSlotHeadRaAction,
  toggleRaSlotAction,
} from "../../actions";

interface RaGridProps {
  slots: Slot[];
  ras: Ra[];
  availability: Array<{ raId: string; slotId: string }>;
  minRas: number;
}

const SLOT_COL = "11rem";
const COVER_COL = "8.5rem";

export default function RaGrid({ slots, ras, availability, minRas }: RaGridProps) {
  const [pending, startTransition] = useTransition();
  const set = new Set(availability.map((a) => `${a.raId}|${a.slotId}`));
  const nameById = new Map(ras.map((r) => [r.id, r.name]));

  const toggle = (raId: string, slotId: string) => {
    startTransition(async () => {
      await toggleRaSlotAction(raId, slotId, !set.has(`${raId}|${slotId}`));
    });
  };

  const toggleHead = (raId: string, slot: Slot) => {
    startTransition(async () => {
      await setSlotHeadRaAction(slot.id, slot.headRaId === raId ? null : raId);
    });
  };

  const cancel = (slot: Slot) => {
    const ok = window.confirm(
      `Cancel ${formatDateShort(slot.date)} ${formatTimeRange(slot.startTime, slot.endTime)}? ` +
        "Anyone scheduled will be emailed a cancellation and re-queued."
    );
    if (!ok) return;
    startTransition(async () => {
      await cancelSlotAction(slot.id);
    });
  };

  if (slots.length === 0) {
    return <div className="card p-6 text-ink-soft">No upcoming follow-up sessions.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="card max-h-[32rem] overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left">
              <th
                className="sticky left-0 top-0 z-30 border-b border-r border-line bg-white p-4 font-semibold"
                style={{ width: SLOT_COL, minWidth: SLOT_COL }}
              >
                Session
              </th>
              <th
                className="sticky top-0 z-30 border-b border-r-2 border-line bg-white p-4 text-center font-semibold shadow-[2px_0_4px_rgba(28,25,23,0.06)]"
                style={{ left: SLOT_COL, width: COVER_COL, minWidth: COVER_COL }}
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
              <th className="sticky top-0 z-20 border-b border-line bg-white p-4" />
            </tr>
          </thead>
          <tbody>
            {slots.map((slot) => {
              const count = ras.filter((ra) => set.has(`${ra.id}|${slot.id}`)).length;
              const headId = slot.headRaId;
              const ready = count >= minRas && headId !== null;
              return (
                <tr key={slot.id} className="group">
                  <td
                    className="sticky left-0 z-10 border-b border-r border-line bg-white p-4 group-hover:bg-stone-50"
                    style={{ width: SLOT_COL, minWidth: SLOT_COL }}
                  >
                    <Link
                      href={`/admin/sessions/${slot.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {formatDateShort(slot.date)}
                    </Link>
                    {slot.followUpOf && (
                      <span className="chip ml-2 bg-blue-100 text-blue-800">follow-up</span>
                    )}
                    <span className="block text-xs text-ink-soft">
                      {formatTimeRange(slot.startTime, slot.endTime)}
                    </span>
                  </td>

                  <td
                    className="sticky z-10 border-b border-r-2 border-line bg-white p-4 text-center shadow-[2px_0_4px_rgba(28,25,23,0.06)] group-hover:bg-stone-50"
                    style={{ left: SLOT_COL, width: COVER_COL, minWidth: COVER_COL }}
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
                    const on = set.has(`${ra.id}|${slot.id}`);
                    const isHead = headId === ra.id;
                    return (
                      <td
                        key={ra.id}
                        className="border-b border-line p-2 text-center align-middle group-hover:bg-stone-50"
                      >
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => toggle(ra.id, slot.id)}
                            aria-pressed={on}
                            aria-label={`${ra.name} covers ${slot.date} ${slot.startTime}`}
                            className={`h-8 w-8 rounded-lg border text-xs font-bold transition-colors ${
                              on
                                ? "border-badger bg-badger text-white"
                                : "border-line bg-white text-transparent hover:border-stone-400"
                            }`}
                          >
                            ✓
                          </button>
                          {on && (
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => toggleHead(ra.id, slot)}
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

                  <td className="border-b border-line p-4 text-right group-hover:bg-stone-50">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => cancel(slot)}
                      className="text-xs font-semibold text-stone-400 hover:text-badger"
                    >
                      Cancel
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ras.length === 0 && (
        <p className="text-sm text-amber-700">
          Add RAs on the People page to mark coverage — sessions with fewer than {minRas}{" "}
          RAs won&apos;t be scheduled.
        </p>
      )}
    </div>
  );
}
