"use client";

import { useRef, useTransition } from "react";
import type { Ra } from "@/lib/types";
import { addRaAction, setRaActiveAction } from "../../actions";

export default function RaManager({ ras }: { ras: Ra[] }) {
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const handleAdd = (formData: FormData) => {
    startTransition(async () => {
      await addRaAction(formData);
      formRef.current?.reset();
    });
  };

  const toggle = (ra: Ra) => {
    startTransition(async () => {
      await setRaActiveAction(ra.id, !ra.active);
    });
  };

  return (
    <div className="space-y-4">
      <form ref={formRef} action={handleAdd} className="flex gap-2">
        <input
          name="name"
          type="text"
          required
          placeholder="RA name (e.g. Melia)"
          className="input flex-1"
        />
        <button type="submit" disabled={pending} className="btn-ghost shrink-0">
          Add
        </button>
      </form>
      {ras.length === 0 ? (
        <p className="text-sm text-ink-soft">No RAs yet — add the study team above.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {ras.map((ra) => (
            <li key={ra.id}>
              <button
                type="button"
                onClick={() => toggle(ra)}
                disabled={pending}
                title={ra.active ? "Click to deactivate" : "Click to reactivate"}
                className={`chip transition-colors ${
                  ra.active
                    ? "bg-stone-800 text-white hover:bg-stone-600"
                    : "bg-stone-100 text-stone-400 line-through hover:text-stone-600"
                }`}
              >
                {ra.name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-stone-500">
        Click a name to deactivate/reactivate. Inactive RAs don&apos;t count toward slot
        coverage.
      </p>
    </div>
  );
}
