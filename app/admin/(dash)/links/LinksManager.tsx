"use client";

// Editing the RA quick-links list.
//
// The whole list is edited locally and saved in one go, rather than each row
// hitting the server as you type. It is a handful of rows that change a few
// times a semester, and one save button makes reordering and deleting behave
// the way anyone would expect.

import { useState, useTransition } from "react";
import type { RaLink } from "@/lib/types";
import { saveRaLinksAction } from "../../actions";

interface LinksManagerProps {
  links: RaLink[];
}

/** Ids only have to be unique within the list; the index is not stable enough. */
function newId(existing: readonly RaLink[]): string {
  let n = existing.length + 1;
  const taken = new Set(existing.map((l) => l.id));
  while (taken.has(`link-${n}`)) n += 1;
  return `link-${n}`;
}

export default function LinksManager({ links: initial }: LinksManagerProps) {
  const [links, setLinks] = useState<RaLink[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (next: RaLink[]) => {
    setLinks(next);
    setDirty(true);
    setMessage(null);
  };

  const edit = (id: string, patch: Partial<RaLink>) =>
    update(links.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  const remove = (id: string) => update(links.filter((l) => l.id !== id));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= links.length) return;
    const next = [...links];
    [next[index], next[target]] = [next[target], next[index]];
    update(next);
  };

  const add = () =>
    update([...links, { id: newId(links), label: "", url: "", note: "" }]);

  const save = () => {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await saveRaLinksAction(links);
      if (result.error) {
        setError(result.error);
        return;
      }
      setLinks(result.links ?? links);
      setDirty(false);
      setMessage("Saved. RAs see this list on their portal.");
    });
  };

  return (
    <div className="space-y-4">
      {links.length === 0 && (
        <p className="text-sm text-ink-soft">
          Nothing here yet. Add the session script first — that&apos;s the one RAs
          open every time.
        </p>
      )}

      {links.map((link, index) => (
        <div key={link.id} className="card space-y-2 p-5">
          <div className="flex items-start gap-2">
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor={`${link.id}-label`}>
                  Name
                </label>
                <input
                  id={`${link.id}-label`}
                  type="text"
                  value={link.label}
                  onChange={(e) => edit(link.id, { label: e.target.value })}
                  placeholder="Round Robin session script"
                  className="input"
                />
              </div>
              <div>
                <label className="label" htmlFor={`${link.id}-url`}>
                  Link
                </label>
                <input
                  id={`${link.id}-url`}
                  type="url"
                  value={link.url}
                  onChange={(e) => edit(link.id, { url: e.target.value })}
                  placeholder="https://docs.google.com/…"
                  className="input"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`${link.id}-note`}>
                  What it&apos;s for <span className="font-normal">(optional)</span>
                </label>
                <input
                  id={`${link.id}-note`}
                  type="text"
                  value={link.note}
                  onChange={(e) => edit(link.id, { note: e.target.value })}
                  placeholder="Read from this during the session."
                  className="input"
                />
              </div>
            </div>

            <div className="flex shrink-0 flex-col gap-1 pt-7">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${link.label || "link"} up`}
                className="btn-ghost px-3 py-1 text-xs"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === links.length - 1}
                aria-label={`Move ${link.label || "link"} down`}
                className="btn-ghost px-3 py-1 text-xs"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => remove(link.id)}
                aria-label={`Remove ${link.label || "link"}`}
                className="btn-danger px-3 py-1 text-xs"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={add} className="btn-ghost">
          Add a link
        </button>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="btn-primary"
        >
          {pending ? "Saving…" : "Save links"}
        </button>
        {message && <span className="text-sm font-medium text-green-800">{message}</span>}
        {error && <span className="text-sm text-badger">{error}</span>}
      </div>
    </div>
  );
}
