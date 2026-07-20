"use client";

import { useState, useTransition } from "react";
import { signInParticipant } from "../actions";

export default function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await signInParticipant(formData);
      if (!result.ok) setError(result.error ?? "Something went wrong.");
    });
  };

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-badger">
            Niedenthal Lab
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">
            Conversation Study Scheduler
          </h1>
          <p className="mt-3 text-ink-soft">
            Tell us every time you could attend, and we&apos;ll match you with a
            session. It takes about a minute.
          </p>
        </div>

        <form action={handleSubmit} className="card p-6 sm:p-8">
          <div className="mb-4">
            <label htmlFor="fullName" className="label">
              Full name
            </label>
            <input
              id="fullName"
              name="fullName"
              type="text"
              autoComplete="name"
              required
              placeholder="Bucky Badger"
              className="input"
            />
          </div>
          <div className="mb-4">
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@wisc.edu"
              className="input"
            />
            <p className="mt-1.5 text-xs text-stone-500">
              Use the same email you signed up with — it&apos;s how we match your
              sessions.
            </p>
          </div>
          <div className="mb-6">
            <label htmlFor="netid" className="label">
              UW NetID
            </label>
            <input
              id="netid"
              name="netid"
              type="text"
              autoComplete="username"
              required
              inputMode="text"
              pattern="[A-Za-z0-9]+"
              placeholder="bbadger"
              className="input"
            />
            <p className="mt-1.5 text-xs text-stone-500">
              Just the NetID (e.g. bbadger) — not the full @wisc.edu address. We use it
              to grant your SONA credit.
            </p>
          </div>
          {error && (
            <p className="mb-4 rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">
              {error}
            </p>
          )}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Signing in…" : "Continue"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-stone-500">
          Questions? Reply to any study email and a research assistant will help.
        </p>
      </div>
    </main>
  );
}
