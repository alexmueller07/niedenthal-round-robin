"use client";

// Signed-in participant portal: current session status + availability editor.

import { useMemo, useState, useTransition } from "react";
import type { Assignment, Participant, Slot } from "@/lib/types";
import { formatDate, formatTimeRange } from "@/lib/format";
import { confirmMyAssignment, saveAvailability, signOutParticipant } from "../actions";

interface PortalProps {
  participant: Participant;
  /** Open, upcoming slots the participant may mark availability for. */
  slots: Slot[];
  /** Slot ids the participant already marked available. */
  availability: string[];
  /** The participant's assignments joined with their slots. */
  assignments: Array<{ assignment: Assignment; slot: Slot }>;
}

export default function Portal({ participant, slots, availability, assignments }: PortalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(availability));
  const [saved, setSaved] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const live = assignments.filter(
    (a) => a.assignment.status === "invited" || a.assignment.status === "confirmed"
  );
  const past = assignments.filter((a) => a.assignment.status === "attended");

  const byDate = useMemo(() => {
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const list = groups.get(slot.date) ?? [];
      list.push(slot);
      groups.set(slot.date, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const toggle = (slotId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
    setSaved(false);
    setMessage(null);
  };

  const handleSave = () => {
    startTransition(async () => {
      const result = await saveAvailability([...selected]);
      if (result.ok) {
        setSaved(true);
        setMessage("Availability saved. We'll email you when you're scheduled.");
      } else {
        setMessage(result.error ?? "Something went wrong.");
      }
    });
  };

  const handleConfirm = (assignmentId: string) => {
    startTransition(async () => {
      await confirmMyAssignment(assignmentId);
    });
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-badger">
            Niedenthal Emotions Lab
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
            Hi, {participant.fullName.split(" ")[0]}
          </h1>
        </div>
        <form action={signOutParticipant}>
          <button type="submit" className="text-sm text-stone-500 underline-offset-4 hover:underline">
            Not you?
          </button>
        </form>
      </header>

      {/* Current session */}
      {live.length > 0 && (
        <section className="mb-8 space-y-4">
          {live.map(({ assignment, slot }) => (
            <div key={assignment.id} className="card overflow-hidden">
              <div className="h-1.5 bg-badger" />
              <div className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-ink-soft">
                      {assignment.status === "confirmed"
                        ? "You're confirmed for"
                        : "You're scheduled for"}
                    </p>
                    <p className="mt-1 text-xl font-bold">{formatDate(slot.date)}</p>
                    <p className="text-lg text-ink-soft">
                      {formatTimeRange(slot.startTime, slot.endTime)}
                    </p>
                  </div>
                  {assignment.status === "invited" ? (
                    <button
                      onClick={() => handleConfirm(assignment.id)}
                      disabled={pending}
                      className="btn-primary"
                    >
                      Confirm attendance
                    </button>
                  ) : (
                    <span className="chip bg-green-100 text-green-800">✓ Confirmed</span>
                  )}
                </div>
                <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
                  Brogden Psychology Building, 1202 W Johnson St — follow the signs to
                  the orientation room. Can&apos;t make it anymore? Reply to your
                  invitation email as soon as possible.
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {live.length === 0 && selected.size > 0 && saved && (
        <section className="card mb-8 p-6">
          <p className="font-semibold">We&apos;re finding you a session time.</p>
          <p className="mt-1 text-sm text-ink-soft">
            You&apos;ll get an email as soon as you&apos;re matched with a group. The more
            times you mark below, the sooner that happens.
          </p>
        </section>
      )}

      {/* Availability editor */}
      <section>
        <h2 className="text-lg font-bold">
          {live.length > 0 ? "Availability for future sessions" : "When could you come in?"}
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-soft">
          Select <span className="font-semibold text-ink">every</span>
          {" time "}you could attend — only mark times you&apos;re certain about. Sessions last about 2 hours.
        </p>

        {byDate.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            No session times are posted yet. Check back soon — we&apos;ll also email you
            when new times open up.
          </div>
        ) : (
          <div className="space-y-6">
            {byDate.map(([date, daySlots]) => (
              <div key={date}>
                <h3 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-ink-soft">
                  {formatDate(date)}
                </h3>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {daySlots.map((slot) => {
                    const active = selected.has(slot.id);
                    return (
                      <button
                        key={slot.id}
                        type="button"
                        onClick={() => toggle(slot.id)}
                        aria-pressed={active}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-all ${
                          active
                            ? "border-badger bg-badger-soft shadow-[inset_0_0_0_1px_#c5050c]"
                            : "border-line bg-white hover:border-stone-400"
                        }`}
                      >
                        <span className="font-medium">
                          {formatTimeRange(slot.startTime, slot.endTime)}
                        </span>
                        <span
                          aria-hidden
                          className={`flex h-5 w-5 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
                            active
                              ? "border-badger bg-badger text-white"
                              : "border-stone-300 text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {byDate.length > 0 && (
          <div className="sticky bottom-4 mt-8">
            <div className="card flex items-center justify-between gap-4 p-4">
              <p className="text-sm text-ink-soft">
                {selected.size} time{selected.size === 1 ? "" : "s"} selected
                {!saved && <span className="ml-2 font-semibold text-badger">· unsaved</span>}
              </p>
              <button
                onClick={handleSave}
                disabled={pending || saved}
                className="btn-primary"
              >
                {pending ? "Saving…" : saved ? "Saved" : "Save availability"}
              </button>
            </div>
            {message && <p className="mt-2 px-1 text-sm text-ink-soft">{message}</p>}
          </div>
        )}
      </section>

      {/* History */}
      {past.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-bold">Completed sessions</h2>
          <ul className="card divide-y divide-line">
            {past.map(({ assignment, slot }) => (
              <li key={assignment.id} className="flex items-center justify-between p-4">
                <span>
                  {formatDate(slot.date)} · {formatTimeRange(slot.startTime, slot.endTime)}
                </span>
                <span className="chip bg-green-100 text-green-800">Attended</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
