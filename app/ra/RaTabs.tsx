"use client";

// Tabs for the RA portal.
//
// Reese asked for "a tab up top with links", and the roster landed at the same
// time, so the portal stopped being one form and became three things. Tabs
// rather than one long scroll: an RA opening this mid-session wants the script
// link in one click, not after scrolling past an availability grid.
//
// All three panels are rendered on the server and passed in; switching tabs is
// local and instant, with no request.

import { useState } from "react";

const TABS = [
  { key: "links", label: "Links" },
  { key: "roster", label: "Who's in" },
  { key: "availability", label: "My availability" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface RaTabsProps {
  links: React.ReactNode;
  roster: React.ReactNode;
  availability: React.ReactNode;
}

export default function RaTabs({ links, roster, availability }: RaTabsProps) {
  const [tab, setTab] = useState<TabKey>("links");

  const panels: Record<TabKey, React.ReactNode> = { links, roster, availability };

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-1 border-b border-line pb-2" aria-label="RA portal">
        {TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            aria-current={tab === item.key ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === item.key
                ? "bg-badger text-white"
                : "text-ink-soft hover:bg-stone-100 hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {panels[tab]}
    </div>
  );
}
