"use client";

// Semester window + one-click generation of dated sessions from the weekly
// shifts. Generation is idempotent, so re-running after adding a shift or
// extending the window only fills the gaps — and there is now a way back out
// of a generation that went wrong.

import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import {
  deleteSessionsAction,
  generateSemesterSlotsAction,
  updateSemesterAction,
} from "../../actions";

interface SemesterPanelProps {
  semesterStart: string;
  semesterEnd: string;
  /** Ids of sessions generated from shifts inside the window. */
  generatedSlotIds: string[];
  /** How many of those have participants who would need emailing. */
  withPeopleCount: number;
  activeShiftCount: number;
}

export default function SemesterPanel({
  semesterStart,
  semesterEnd,
  generatedSlotIds,
  withPeopleCount,
  activeShiftCount,
}: SemesterPanelProps) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const existingSessions = generatedSlotIds.length;

  const saveDates = (formData: FormData) => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateSemesterAction(formData);
      if (result.error) setError(result.error);
      else setMessage("Semester window saved.");
    });
  };

  const generate = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await generateSemesterSlotsAction();
      if (result.error) setError(result.error);
      else
        setMessage(
          result.created === 0
            ? "Already up to date — no new sessions to generate."
            : `Generated ${result.created} new session${result.created === 1 ? "" : "s"}.`
        );
    });
  };

  const clearAll = () => {
    setError(null);
    setMessage(null);
    const warning =
      withPeopleCount > 0
        ? `\n\n${withPeopleCount} of them ${withPeopleCount === 1 ? "has" : "have"} participants. Those will be canceled and everyone emailed, not silently deleted.`
        : "";
    const ok = window.confirm(
      `Remove all ${existingSessions} generated session${existingSessions === 1 ? "" : "s"} for ${formatDate(semesterStart)} – ${formatDate(semesterEnd)}?${warning}\n\nThe weekly schedule itself is kept — you can regenerate.`
    );
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteSessionsAction(generatedSlotIds);
      if (result.error) {
        setError(result.error);
        return;
      }
      const bits: string[] = [];
      if (result.deleted > 0) bits.push(`${result.deleted} deleted`);
      if (result.canceled > 0) bits.push(`${result.canceled} canceled and emailed`);
      setMessage(bits.length > 0 ? `Cleared — ${bits.join(", ")}.` : "Nothing to remove.");
    });
  };

  return (
    <div className="space-y-4">
      <form action={saveDates} className="grid grid-cols-2 gap-3 sm:max-w-md">
        <div>
          <label htmlFor="semesterStart" className="label">
            Semester start
          </label>
          <input
            id="semesterStart"
            name="semesterStart"
            type="date"
            required
            defaultValue={semesterStart}
            className="input"
          />
        </div>
        <div>
          <label htmlFor="semesterEnd" className="label">
            Semester end
          </label>
          <input
            id="semesterEnd"
            name="semesterEnd"
            type="date"
            required
            defaultValue={semesterEnd}
            className="input"
          />
        </div>
        <div className="col-span-2">
          <button type="submit" disabled={pending} className="btn-ghost">
            Save window
          </button>
        </div>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-stone-50 px-4 py-3">
        <p className="text-sm text-ink-soft">
          {existingSessions} session{existingSessions === 1 ? "" : "s"} generated for{" "}
          {formatDate(semesterStart)} – {formatDate(semesterEnd)} from {activeShiftCount}{" "}
          active shift{activeShiftCount === 1 ? "" : "s"}.
        </p>
        <div className="flex flex-wrap gap-2">
          {existingSessions > 0 && (
            <button
              type="button"
              onClick={clearAll}
              disabled={pending}
              className="btn-danger px-4 py-2 text-xs"
            >
              Remove all
            </button>
          )}
          <button
            type="button"
            onClick={generate}
            disabled={pending || activeShiftCount === 0}
            className="btn-primary"
          >
            {pending ? "Working…" : "Generate sessions"}
          </button>
        </div>
      </div>

      {message && (
        <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}
    </div>
  );
}
