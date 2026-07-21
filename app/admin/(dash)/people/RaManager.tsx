"use client";

// The RA roster. A NetID here is what lets that RA sign in to /ra and submit
// their own availability, so the roster doubles as the access list.

import { useRef, useState, useTransition } from "react";
import type { Ra } from "@/lib/types";
import { addRaAction, setRaActiveAction, setRaIdentityAction } from "../../actions";

interface RaManagerProps {
  ras: Ra[];
  /** How many shifts each RA said they can staff (self-service submissions). */
  offeredCountByRa: Record<string, number>;
}

export default function RaManager({ ras, offeredCountByRa }: RaManagerProps) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const handleAdd = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await addRaAction(formData);
      if (result.error) setError(result.error);
      else formRef.current?.reset();
    });
  };

  const saveIdentity = (raId: string, formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await setRaIdentityAction(
        raId,
        String(formData.get("netid") ?? ""),
        String(formData.get("email") ?? "")
      );
      if (result.error) setError(result.error);
      else setEditing(null);
    });
  };

  return (
    <div className="space-y-4">
      <form
        ref={formRef}
        action={handleAdd}
        className="grid gap-2 sm:grid-cols-[1fr_auto_auto]"
      >
        <input
          name="name"
          type="text"
          required
          placeholder="RA name (e.g. Melia)"
          className="input"
        />
        <input name="netid" type="text" placeholder="NetID (optional)" className="input" />
        <button type="submit" disabled={pending} className="btn-ghost shrink-0">
          Add RA
        </button>
      </form>

      {error && (
        <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
      )}

      {ras.length === 0 ? (
        <p className="text-sm text-ink-soft">No RAs yet — add the study team above.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {ras.map((ra) => {
            const offered = offeredCountByRa[ra.id] ?? 0;
            const responded = ra.availabilitySubmittedAt !== null;
            return (
              <li key={ra.id} className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`font-medium ${ra.active ? "" : "text-stone-400 line-through"}`}
                      >
                        {ra.name}
                      </span>
                      {ra.netid ? (
                        <span className="chip bg-stone-100 text-stone-600">{ra.netid}</span>
                      ) : (
                        <span
                          className="chip bg-amber-100 text-amber-800"
                          title="Without a NetID this RA can't sign in to submit availability"
                        >
                          no NetID
                        </span>
                      )}
                      {responded ? (
                        <span className="chip bg-green-100 text-green-800">
                          offered {offered} shift{offered === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="chip bg-stone-100 text-stone-500">
                          hasn&apos;t responded
                        </span>
                      )}
                    </div>
                    {ra.email && (
                      <p className="mt-1 truncate text-xs text-stone-400">{ra.email}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditing(editing === ra.id ? null : ra.id)}
                      className="text-xs font-semibold text-stone-400 hover:text-ink"
                    >
                      {editing === ra.id ? "Cancel" : "Edit sign-in"}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          await setRaActiveAction(ra.id, !ra.active);
                        })
                      }
                      className="text-xs font-semibold text-stone-400 hover:text-badger"
                    >
                      {ra.active ? "Deactivate" : "Reactivate"}
                    </button>
                  </div>
                </div>

                {editing === ra.id && (
                  <form
                    action={(fd) => saveIdentity(ra.id, fd)}
                    className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
                  >
                    <input
                      name="netid"
                      type="text"
                      defaultValue={ra.netid ?? ""}
                      placeholder="NetID"
                      className="input"
                    />
                    <input
                      name="email"
                      type="email"
                      defaultValue={ra.email ?? ""}
                      placeholder="email@wisc.edu"
                      className="input"
                    />
                    <button type="submit" disabled={pending} className="btn-ghost">
                      Save
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-xs text-stone-500">
        A NetID lets an RA sign in at <code>/ra</code> to mark which shifts they can
        staff. Inactive RAs don&apos;t count toward session coverage.
      </p>
    </div>
  );
}
