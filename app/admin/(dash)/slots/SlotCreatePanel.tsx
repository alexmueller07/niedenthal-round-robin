"use client";

// Slot creation with two input modes: the quick date/time form, or the
// drag calendar (paint blocks that split into session slots).

import { useState } from "react";
import SlotCalendarCreate from "./SlotCalendarCreate";
import SlotCreateForm from "./SlotCreateForm";

type Mode = "calendar" | "form";

export default function SlotCreatePanel({ dates }: { dates: string[] }) {
  const [mode, setMode] = useState<Mode>("calendar");

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      aria-pressed={mode === m}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
        mode === m ? "bg-ink text-white" : "text-ink-soft hover:bg-stone-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="card p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold">New session slots</h2>
        <div className="flex gap-1 rounded-full border border-line p-1">
          {tab("calendar", "Drag calendar")}
          {tab("form", "Quick form")}
        </div>
      </div>
      {mode === "calendar" ? <SlotCalendarCreate dates={dates} /> : <SlotCreateForm />}
    </section>
  );
}
