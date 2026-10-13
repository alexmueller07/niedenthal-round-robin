"use client";

// The "Need help?" pop-up, on every admin page. A participant pressing the
// help button on a rating station has to reach whoever is watching, and the
// Lab Suite's Control Center window lands on /admin, not on the control page —
// so the request is shown wherever an RA happens to be, with Resolve right
// there.

import Link from "next/link";
import { useState } from "react";
import { resolveHelp, useStations } from "./StationBoard";

export default function StationHelpBanner() {
  const { data, refresh } = useStations();
  const [busy, setBusy] = useState<string | null>(null);
  const asking = (data?.stations ?? []).filter((s) => s.needsHelp);
  if (asking.length === 0) return null;

  return (
    <div role="alert" className="border-b-2 border-badger bg-badger-soft">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-3">
        {asking.map((s) => (
          <div key={s.stationKey} className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-badger">
              🖐 {s.label || s.stationKey} needs help
            </span>
            <span className="text-sm text-ink-soft">{s.stage}</span>
            <button
              type="button"
              disabled={busy === s.stationKey}
              onClick={async () => {
                setBusy(s.stationKey);
                await resolveHelp(s.stationKey);
                await refresh();
                setBusy(null);
              }}
              className="btn-primary ml-auto px-4 py-1.5 text-xs"
            >
              {busy === s.stationKey ? "Resolving…" : "Resolve"}
            </button>
          </div>
        ))}
        <Link href="/admin/control" className="text-xs text-badger underline-offset-4 hover:underline">
          All rating stations →
        </Link>
      </div>
    </div>
  );
}
