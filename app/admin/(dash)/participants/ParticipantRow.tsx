"use client";

import { useTransition } from "react";
import type { Participant } from "@/lib/types";
import { setParticipantStatusAction } from "../../actions";

interface ParticipantRowProps {
  participant: Participant;
  availability: number;
  attended: number;
  noShows: number;
  currentSession: string | null;
}

const STATUS_CHIP: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  completed: "bg-stone-800 text-white",
  withdrawn: "bg-stone-100 text-stone-500",
};

export default function ParticipantRow({
  participant,
  availability,
  attended,
  noShows,
  currentSession,
}: ParticipantRowProps) {
  const [pending, startTransition] = useTransition();

  const setStatus = (status: "active" | "completed" | "withdrawn") => {
    startTransition(async () => {
      await setParticipantStatusAction(participant.id, status);
    });
  };

  return (
    <tr>
      <td className="p-4">
        <p className="font-medium">{participant.fullName}</p>
        <p className="text-stone-400">{participant.email}</p>
      </td>
      <td className="p-4">
        {availability > 0 ? (
          `${availability} slot${availability === 1 ? "" : "s"}`
        ) : (
          <span className="text-amber-700">none yet</span>
        )}
      </td>
      <td className="p-4">{currentSession ?? <span className="text-stone-400">—</span>}</td>
      <td className="p-4">
        {attended} attended
        {noShows > 0 && <span className="text-badger"> · {noShows} no-show{noShows === 1 ? "" : "s"}</span>}
      </td>
      <td className="p-4">
        <span className={`chip ${STATUS_CHIP[participant.status]}`}>{participant.status}</span>
      </td>
      <td className="p-4 text-right">
        {participant.status === "active" ? (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus("completed")}
              className="text-xs font-semibold text-stone-500 hover:text-ink"
            >
              Mark done
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setStatus("withdrawn")}
              className="text-xs font-semibold text-stone-400 hover:text-badger"
            >
              Withdraw
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setStatus("active")}
            className="text-xs font-semibold text-stone-500 hover:text-ink"
          >
            Reactivate
          </button>
        )}
      </td>
    </tr>
  );
}
