"use client";

import { useState, useTransition } from "react";
import type { Slot } from "@/lib/types";
import { completeSlotAction, createFollowUpSlotAction } from "../../../actions";

export default function SessionActions({ slot }: { slot: Slot }) {
  const [pending, startTransition] = useTransition();
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = () => {
    if (!window.confirm("Mark this session as completed?")) return;
    startTransition(async () => {
      await completeSlotAction(slot.id);
    });
  };

  const createFollowUp = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createFollowUpSlotAction(slot.id, formData);
      if (result.error) setError(result.error);
      else setShowFollowUp(false);
    });
  };

  return (
    <div className="flex flex-col items-end gap-3">
      <div className="flex gap-2">
        <a
          href={`/api/export/roster/${slot.id}`}
          className="btn-ghost px-4 py-2 text-xs"
          download
        >
          Export roster CSV
        </a>
        <button
          type="button"
          onClick={() => setShowFollowUp((v) => !v)}
          className="btn-ghost px-4 py-2 text-xs"
        >
          {showFollowUp ? "Close" : "Plan follow-up"}
        </button>
        {slot.status !== "completed" && (
          <button
            type="button"
            disabled={pending}
            onClick={complete}
            className="btn-primary px-4 py-2 text-xs"
          >
            Complete session
          </button>
        )}
      </div>

      {showFollowUp && (
        <form action={createFollowUp} className="card flex flex-wrap items-end gap-3 p-4">
          <p className="w-full text-xs text-ink-soft">
            A follow-up slot only admits this session&apos;s attendees — for finishing
            the remaining conversations on a second visit.
          </p>
          <div>
            <label className="label" htmlFor="fu-date">
              Date
            </label>
            <input id="fu-date" name="date" type="date" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="fu-start">
              Start
            </label>
            <input id="fu-start" name="startTime" type="time" required className="input" />
          </div>
          <div>
            <label className="label" htmlFor="fu-end">
              End
            </label>
            <input id="fu-end" name="endTime" type="time" required className="input" />
          </div>
          <button type="submit" disabled={pending} className="btn-primary">
            Create
          </button>
          {error && <p className="w-full text-sm text-badger">{error}</p>}
        </form>
      )}
    </div>
  );
}
