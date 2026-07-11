"use client";

// Slots × RAs coverage grid. Each cell toggles one RA's availability for one
// slot; the row header shows whether the slot has enough coverage to be
// schedulable.

import Link from "next/link";
import { useTransition } from "react";
import type { Ra, Slot } from "@/lib/types";
import { formatDateShort, formatTimeRange } from "@/lib/format";
import { cancelSlotAction, toggleRaSlotAction } from "../../actions";

interface RaGridProps {
  slots: Slot[];
  ras: Ra[];
  availability: Array<{ raId: string; slotId: string }>;
  minRas: number;
}

export default function RaGrid({ slots, ras, availability, minRas }: RaGridProps) {
  const [pending, startTransition] = useTransition();
  const set = new Set(availability.map((a) => `${a.raId}|${a.slotId}`));

  const toggle = (raId: string, slotId: string) => {
    const available = set.has(`${raId}|${slotId}`);
    startTransition(async () => {
      await toggleRaSlotAction(raId, slotId, !available);
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
    return <div className="card p-6 text-ink-soft">No upcoming slots yet.</div>;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-line text-left">
            <th className="p-4 font-semibold">Slot</th>
            {ras.map((ra) => (
              <th key={ra.id} className="p-4 text-center font-semibold">
                {ra.name}
              </th>
            ))}
            <th className="p-4 text-center font-semibold">Coverage</th>
            <th className="p-4" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {slots.map((slot) => {
            const count = ras.filter((ra) => set.has(`${ra.id}|${slot.id}`)).length;
            const covered = count >= minRas;
            return (
              <tr key={slot.id}>
                <td className="p-4">
                  <Link
                    href={`/admin/sessions/${slot.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {formatDateShort(slot.date)}
                  </Link>
                  <span className="ml-2 text-ink-soft">
                    {formatTimeRange(slot.startTime, slot.endTime)}
                  </span>
                  {slot.followUpOf && (
                    <span className="chip ml-2 bg-blue-100 text-blue-800">follow-up</span>
                  )}
                </td>
                {ras.map((ra) => {
                  const on = set.has(`${ra.id}|${slot.id}`);
                  return (
                    <td key={ra.id} className="p-2 text-center">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => toggle(ra.id, slot.id)}
                        aria-pressed={on}
                        aria-label={`${ra.name} availability for ${slot.date} ${slot.startTime}`}
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
                <td className="p-4 text-right">
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
      {ras.length === 0 && (
        <p className="border-t border-line p-4 text-sm text-amber-700">
          Add RAs above to mark coverage — slots without {minRas} RA
          {minRas === 1 ? "" : "s"} won&apos;t be scheduled.
        </p>
      )}
    </div>
  );
}
