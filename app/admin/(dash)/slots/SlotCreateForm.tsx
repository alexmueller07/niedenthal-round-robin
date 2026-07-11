"use client";

import { useRef, useState, useTransition } from "react";
import { createSlotsAction } from "../../actions";

export default function SlotCreateForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await createSlotsAction(formData);
      if (result.error) setError(result.error);
      else formRef.current?.reset();
    });
  };

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="date" className="label">
            Date
          </label>
          <input id="date" name="date" type="date" required className="input" />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor="repeatWeeks" className="label">
            Repeat weekly
          </label>
          <select id="repeatWeeks" name="repeatWeeks" defaultValue="1" className="input">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n === 1 ? "Just this week" : `${n} weeks`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="startTime" className="label">
            Start
          </label>
          <input id="startTime" name="startTime" type="time" required className="input" />
        </div>
        <div>
          <label htmlFor="endTime" className="label">
            End
          </label>
          <input id="endTime" name="endTime" type="time" required className="input" />
        </div>
      </div>
      {error && (
        <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Creating…" : "Create slot"}
      </button>
    </form>
  );
}
