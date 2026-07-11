"use client";

import { useState, useTransition } from "react";
import type { Settings } from "@/lib/types";
import { updateSettingsAction } from "../../actions";

const FIELDS = [
  { name: "groupMin", label: "Group min", hint: "3 rooms × 2 people" },
  { name: "groupMax", label: "Group max" },
  { name: "overrecruit", label: "Alternates" },
  { name: "minRas", label: "Min RAs per slot" },
  { name: "seed", label: "Random seed" },
] as const;

export default function SettingsForm({ settings }: { settings: Settings }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setMessage(null);
    startTransition(async () => {
      const result = await updateSettingsAction(formData);
      setMessage(result.error ?? "Settings saved.");
    });
  };

  return (
    <form action={handleSubmit} className="flex flex-wrap items-end gap-4">
      {FIELDS.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name} className="label">
            {f.label}
          </label>
          <input
            id={f.name}
            name={f.name}
            type="number"
            defaultValue={settings[f.name]}
            className="input w-28"
          />
        </div>
      ))}
      <button type="submit" disabled={pending} className="btn-ghost">
        {pending ? "Saving…" : "Save settings"}
      </button>
      {message && <p className="w-full text-sm text-ink-soft">{message}</p>}
    </form>
  );
}
