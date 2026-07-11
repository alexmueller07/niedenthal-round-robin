"use client";

import { useState, useTransition } from "react";
import { loginAdmin } from "../actions";

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await loginAdmin(formData);
      if (result?.error) setError(result.error);
    });
  };

  return (
    <form action={handleSubmit} className="card p-6">
      <label htmlFor="password" className="label">
        Lab password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        className="input"
      />
      {error && (
        <p className="mt-3 rounded-xl bg-badger-soft px-4 py-2.5 text-sm text-badger">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn-primary mt-4 w-full">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
