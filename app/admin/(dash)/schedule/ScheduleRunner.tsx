"use client";

// Preview → approve flow for the assignment engine.

import { useState, useTransition } from "react";
import {
  applyScheduleAction,
  previewScheduleAction,
  type ScheduleSummary,
} from "../../actions";

export default function ScheduleRunner() {
  const [summary, setSummary] = useState<ScheduleSummary | null>(null);
  const [pending, startTransition] = useTransition();

  const preview = () => {
    startTransition(async () => {
      setSummary(await previewScheduleAction());
    });
  };

  const apply = () => {
    startTransition(async () => {
      setSummary(await applyScheduleAction());
    });
  };

  const totalInvites = summary?.slots.reduce((n, s) => n + s.invited.length, 0) ?? 0;

  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={preview} disabled={pending} className="btn-ghost">
          {pending ? "Working…" : "Preview proposal"}
        </button>
        {summary && !summary.applied && totalInvites > 0 && (
          <button onClick={apply} disabled={pending} className="btn-primary">
            Approve — send {totalInvites} invitation{totalInvites === 1 ? "" : "s"}
          </button>
        )}
        {summary && (
          <span className="text-xs text-stone-500">seed {summary.seed}</span>
        )}
      </div>

      {summary && (
        <div className="mt-6 space-y-5">
          {summary.applied && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-800">
              Done — {totalInvites} invitation{totalInvites === 1 ? "" : "s"} created and
              emailed. Check the Emails page for anything needing a manual send.
            </p>
          )}

          {summary.slots.length === 0 && (
            <p className="text-sm text-ink-soft">
              Nothing to schedule right now — either every available participant is
              seated, or no slot has enough eligible people and RA coverage.
            </p>
          )}

          {summary.slots.map((slot) => (
            <div key={slot.slotId} className="rounded-xl border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-stone-50 px-4 py-3">
                <p className="font-semibold">{slot.label}</p>
                <p className="text-xs text-ink-soft">
                  {slot.projectedMembers} members
                  {slot.existingLive > 0 && ` (${slot.existingLive} already seated)`}
                </p>
              </div>
              <ul className="divide-y divide-line">
                {slot.invited.map((person) => (
                  <li
                    key={person.email}
                    className="flex items-center justify-between px-4 py-2.5 text-sm"
                  >
                    <span>
                      {person.name}
                      <span className="ml-2 text-stone-400">{person.email}</span>
                    </span>
                    <span
                      className={`chip ${
                        person.role === "member"
                          ? "bg-stone-100 text-stone-600"
                          : "bg-blue-100 text-blue-800"
                      }`}
                    >
                      {person.role}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {(summary.unfillable.length > 0 || summary.unplacedCount > 0) && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {summary.unfillable.map((u) => (
                <p key={u.label}>
                  {u.label}: only {u.eligible} of {u.needed} needed people are eligible.
                </p>
              ))}
              {summary.unplacedCount > 0 && (
                <p>
                  {summary.unplacedCount} participant
                  {summary.unplacedCount === 1 ? "" : "s"} with availability could not be
                  seated yet — they stay in the pool for the next run.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
