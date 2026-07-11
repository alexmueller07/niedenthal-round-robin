"use client";

import { useState } from "react";
import type { EmailLogEntry } from "@/lib/types";

const STATUS_CHIP: Record<string, string> = {
  sent: "bg-green-100 text-green-800",
  failed: "bg-badger-soft text-badger",
  manual: "bg-amber-100 text-amber-800",
};

export default function EmailRow({ entry }: { entry: EmailLogEntry }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(
      `To: ${entry.toEmail}\nSubject: ${entry.subject}\n\n${entry.body}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const when = new Date(entry.createdAt).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <li className="p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
      >
        <span className="min-w-0">
          <span className="font-medium">{entry.subject}</span>
          <span className="ml-2 text-sm text-stone-400">{entry.toEmail}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-xs text-stone-400">{when}</span>
          <span className={`chip ${STATUS_CHIP[entry.status]}`}>{entry.status}</span>
        </span>
      </button>
      {open && (
        <div className="mt-3 rounded-xl bg-stone-50 p-4">
          <pre className="whitespace-pre-wrap font-sans text-sm text-ink">{entry.body}</pre>
          {(entry.status === "manual" || entry.status === "failed") && (
            <button type="button" onClick={copy} className="btn-ghost mt-3 px-4 py-2 text-xs">
              {copied ? "Copied!" : "Copy for manual send"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
