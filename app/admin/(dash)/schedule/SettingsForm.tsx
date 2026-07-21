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
    <form action={handleSubmit} className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
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
        <div>
          <label htmlFor="conversationMinutes" className="label">
            Conversation min
          </label>
          <input
            id="conversationMinutes"
            name="conversationMinutes"
            type="number"
            defaultValue={settings.conversationMinutes}
            className="input w-28"
          />
        </div>
      </div>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="requireHeadRa"
          defaultChecked={settings.requireHeadRa}
          className="mt-0.5 h-4 w-4 accent-badger"
        />
        <span>
          <span className="font-medium">Require a head RA</span>
          <span className="block text-xs text-ink-soft">
            On: a session with no designated head RA will not be filled at all — this is
            what Randy asked for. Off: it still fills, but is flagged on the board and in
            the scheduler preview.
          </span>
        </span>
      </label>

      <div>
        <button type="submit" disabled={pending} className="btn-ghost">
          {pending ? "Saving…" : "Save settings"}
        </button>
        {message && <p className="mt-2 text-sm text-ink-soft">{message}</p>}
      </div>
    </form>
  );
}
