// Read-only rendering of the RA quick links, shared by the admin Links tab and
// the RA portal so both always show the same list.

import type { RaLink } from "@/lib/types";

/** Bare host, for the small grey line under each link. */
function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function LinkList({ links }: { links: RaLink[] }) {
  if (links.length === 0) {
    return (
      <div className="card p-6 text-sm text-ink-soft">
        No links yet. Add the session script and anything else RAs open during a
        session on the Links tab.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {links.map((link) => (
        <a
          key={link.id}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="card block p-5 transition-colors hover:border-badger"
        >
          <span className="flex items-baseline justify-between gap-3">
            <span className="font-semibold">{link.label}</span>
            <span aria-hidden className="text-sm text-stone-400">
              ↗
            </span>
          </span>
          {link.note && <span className="mt-1 block text-sm text-ink-soft">{link.note}</span>}
          <span className="mt-2 block truncate text-xs text-stone-400">
            {hostOf(link.url)}
          </span>
        </a>
      ))}
    </div>
  );
}
