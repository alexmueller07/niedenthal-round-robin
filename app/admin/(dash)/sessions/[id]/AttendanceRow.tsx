"use client";

import { useState, useTransition } from "react";
import type { Assignment, Participant } from "@/lib/types";
import { markAttendanceAction } from "../../../actions";

interface AttendanceRowProps {
  assignment: Assignment;
  participant: Participant;
}

const STATUS_CHIP: Record<string, string> = {
  invited: "bg-amber-100 text-amber-800",
  confirmed: "bg-green-100 text-green-800",
  attended: "bg-stone-800 text-white",
};

export default function AttendanceRow({ assignment, participant }: AttendanceRowProps) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);

  const mark = (status: "attended" | "no_show" | "canceled") => {
    if (status !== "attended") {
      const verb = status === "no_show" ? "mark as no-show" : "cancel";
      if (!window.confirm(`Really ${verb} ${participant.fullName}? They'll be automatically rescheduled.`)) {
        return;
      }
    }
    startTransition(async () => {
      const result = await markAttendanceAction(assignment.id, status);
      const parts: string[] = [];
      if (result.promoted) parts.push(`${result.promoted} promoted from alternate`);
      if (result.rescheduledTo) parts.push(`rescheduled to ${result.rescheduledTo}`);
      else if (status !== "attended") parts.push("no compatible future slot yet — they stay in the pool");
      if (parts.length > 0) setNote(parts.join(" · "));
    });
  };

  return (
    <li className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">
            {participant.fullName}
            {assignment.role === "alternate" && (
              <span className="chip ml-2 bg-blue-100 text-blue-800">alternate</span>
            )}
          </p>
          <p className="truncate text-sm text-stone-400">{participant.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`chip ${STATUS_CHIP[assignment.status] ?? "bg-stone-100 text-stone-600"}`}>
            {assignment.status}
          </span>
          {assignment.status !== "attended" && (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() => mark("attended")}
                className="btn-ghost px-3.5 py-1.5 text-xs"
              >
                Check in
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => mark("no_show")}
                className="btn-danger px-3.5 py-1.5 text-xs"
              >
                No-show
              </button>
            </>
          )}
        </div>
      </div>
      {note && <p className="mt-2 text-sm font-medium text-badger">{note}</p>}
    </li>
  );
}
