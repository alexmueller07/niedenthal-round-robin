"use client";

// Signed-in participant portal: current session status + availability editor.
// The editor narrows choice (preferred times first, the rest collapsed), nudges
// momentum with a subtle "filling up" hint, and always offers an explicit
// "none of these work" escape so nobody leaves their availability blank.

import { useMemo, useState, useTransition } from "react";
import type { Assignment, Participant, Slot } from "@/lib/types";
import { formatDate, formatTimeRange } from "@/lib/format";
import {
  confirmMyAssignment,
  declineAllTimes,
  requestHelp,
  saveAvailability,
  signOutParticipant,
} from "../actions";

interface PortalProps {
  participant: Participant;
  /** Open, upcoming slots the participant may mark availability for. */
  slots: Slot[];
  /** Slot ids the participant already marked available. */
  availability: string[];
  /** The participant's assignments joined with their slots. */
  assignments: Array<{ assignment: Assignment; slot: Slot }>;
  /** Live member seats already taken per slot (momentum nudge). */
  fillBySlot: Record<string, number>;
  /** Group size needed for a session to run. */
  groupTarget: number;
}

export default function Portal({
  participant,
  slots,
  availability,
  assignments,
  fillBySlot,
  groupTarget,
}: PortalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(availability));
  const [saved, setSaved] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [declined, setDeclined] = useState(participant.declinedAll);
  const [showMore, setShowMore] = useState(false);
  const [helpSent, setHelpSent] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  const live = assignments.filter(
    (a) => a.assignment.status === "invited" || a.assignment.status === "confirmed"
  );
  const past = assignments.filter((a) => a.assignment.status === "attended");

  const { preferred, other } = useMemo(() => {
    const groupByDate = (list: Slot[]) => {
      const groups = new Map<string, Slot[]>();
      for (const slot of list) {
        const day = groups.get(slot.date) ?? [];
        day.push(slot);
        groups.set(slot.date, day);
      }
      return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    };
    return {
      preferred: groupByDate(slots.filter((s) => s.preferred)),
      other: groupByDate(slots.filter((s) => !s.preferred)),
    };
  }, [slots]);

  const hasPreferred = preferred.length > 0;

  const toggle = (slotId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
    setSaved(false);
    setDeclined(false);
    setMessage(null);
  };

  const handleSave = () => {
    if (selected.size === 0) {
      setMessage(
        "Please select at least one time — or tap “None of these times work for me” below."
      );
      return;
    }
    startTransition(async () => {
      const result = await saveAvailability([...selected]);
      if (result.ok) {
        setSaved(true);
        setDeclined(false);
        setMessage("Availability saved. We'll email you when you're scheduled.");
      } else {
        setMessage(result.error ?? "Something went wrong.");
      }
    });
  };

  const handleDecline = () => {
    startTransition(async () => {
      const result = await declineAllTimes();
      if (result.ok) {
        setSelected(new Set());
        setSaved(true);
        setDeclined(true);
        setMessage(null);
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

  const renderDayGroups = (groups: Array<[string, Slot[]]>) => (
    <div className="space-y-6">
      {groups.map(([date, daySlots]) => (
        <div key={date}>
          <h3 className="mb-2.5 text-sm font-semibold uppercase tracking-wide text-ink-soft">
            {formatDate(date)}
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {daySlots.map((slot) => (
              <SlotOption
                key={slot.id}
                slot={slot}
                active={selected.has(slot.id)}
                filled={fillBySlot[slot.id] ?? 0}
                target={groupTarget}
                onToggle={() => toggle(slot.id)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:py-12">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-badger">
            Niedenthal Lab
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
                {helpSent.has(assignment.id) ? (
                  <p className="mt-3 rounded-xl bg-green-50 px-4 py-2.5 text-sm font-medium text-green-800">
                    A research assistant has been notified and will be right with you.
                  </p>
                ) : (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await requestHelp(assignment.id);
                        if (result.ok) {
                          setHelpSent((prev) => new Set(prev).add(assignment.id));
                        }
                      })
                    }
                    className="btn-ghost mt-3 border-badger/40 text-badger hover:bg-badger-soft"
                  >
                    🖐 I need help
                  </button>
                )}
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

      {live.length === 0 && declined && (
        <section className="card mb-8 border-badger/30 bg-badger-soft p-6">
          <p className="font-semibold">Thanks for letting us know.</p>
          <p className="mt-1 text-sm text-ink-soft">
            We&apos;ll reach out when new times open up. If your schedule changes, mark
            any time below and we&apos;ll match you right away.
          </p>
        </section>
      )}

      {/* Availability editor */}
      <section>
        <h2 className="text-lg font-bold">
          {live.length > 0 ? "Availability for future sessions" : "When could you come in?"}
        </h2>
        <p className="mt-1 mb-5 text-sm text-ink-soft">
          Tap <span className="font-semibold text-ink">every</span> time you could attend —
          only mark times you&apos;re certain about. Sessions last about 2 hours.
        </p>

        {slots.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            No session times are posted yet. Check back soon — we&apos;ll also email you
            when new times open up.
          </div>
        ) : (
          <div className="space-y-8">
            {hasPreferred && (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-amber-500">★</span>
                  <h3 className="text-sm font-bold uppercase tracking-wide">
                    Recommended times
                  </h3>
                </div>
                {renderDayGroups(preferred)}
              </div>
            )}

            {other.length > 0 &&
              (hasPreferred ? (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowMore((v) => !v)}
                    className="mb-3 text-sm font-semibold text-badger underline-offset-4 hover:underline"
                    aria-expanded={showMore}
                  >
                    {showMore ? "Hide other times" : "Show other times"}
                  </button>
                  {showMore && renderDayGroups(other)}
                </div>
              ) : (
                renderDayGroups(other)
              ))}

            <button
              type="button"
              onClick={handleDecline}
              disabled={pending}
              className="w-full rounded-xl border border-dashed border-line py-3 text-sm font-medium text-stone-500 transition-colors hover:border-stone-400 hover:text-ink"
            >
              None of these times work for me
            </button>
          </div>
        )}

        {slots.length > 0 && (
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

/** One availability option with a subtle, non-revealing "filling up" nudge. */
function SlotOption({
  slot,
  active,
  filled,
  target,
  onToggle,
}: {
  slot: Slot;
  active: boolean;
  filled: number;
  target: number;
  onToggle: () => void;
}) {
  // Never reveal exact capacity or standby math — only momentum toward "on".
  const nudge =
    filled <= 0
      ? null
      : filled >= target
        ? { text: "On to run", tone: "text-green-700" }
        : { text: `Filling up · ${filled}/${target}`, tone: "text-amber-700" };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left transition-all ${
        active
          ? "border-badger bg-badger-soft shadow-[inset_0_0_0_1px_#c5050c]"
          : "border-line bg-white hover:border-stone-400"
      }`}
    >
      <span>
        <span className="block font-medium">
          {formatTimeRange(slot.startTime, slot.endTime)}
        </span>
        {nudge && (
          <span className={`mt-0.5 block text-xs font-medium ${nudge.tone}`}>{nudge.text}</span>
        )}
      </span>
      <span
        aria-hidden
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${
          active
            ? "border-badger bg-badger text-white"
            : "border-stone-300 text-transparent"
        }`}
      >
        ✓
      </span>
    </button>
  );
}
