"use client";

import { useState, useTransition } from "react";
import { signInRa } from "./actions";

export default function RaSignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await signInRa(formData);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  };

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold tracking-tight">RA availability</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Tell the lab which shifts you can staff this semester.
      </p>

      <form action={submit} className="card mt-6 space-y-4 p-6">
        <div>
          <label htmlFor="netid" className="label">
            UW NetID
          </label>
          <input
            id="netid"
            name="netid"
            type="text"
            required
            autoComplete="username"
            placeholder="bbadger"
            className="input"
          />
          <p className="mt-1.5 text-xs text-stone-500">
            Just the NetID — no @wisc.edu.
          </p>
        </div>

        {error && (
          <p className="rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">{error}</p>
        )}

        <button type="submit" disabled={pending} className="btn-primary w-full">
          {pending ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
