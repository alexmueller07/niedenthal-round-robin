"use client";

// The rating stations, live. Lab Suite 1.5.0 stations report under their own
// key (`p-<study ID>`) rather than a participant email, so they are not on the
// session's participant board — they are here, help first. "Resolve" lowers
// the flag, which the station notices within a few seconds and clears its
// "Researcher notified" notice.
//
// Same polling approach as ProgressBoard: 4 s, paused while the tab is hidden,
// freshness measured against the server clock.

import { useCallback, useEffect, useState } from "react";
import type { StationRow } from "@/lib/stations";

const POLL_MS = 4000;
const QUIET_S = 180;
const STALLED_S = 360;

type Payload = { serverNow: string; stations: StationRow[] };

function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function isDone(row: StationRow): boolean {
  if (row.percent !== null && row.percent >= 100) return true;
  const stage = row.stage.toLowerCase();
  return stage.includes("done") || stage.includes("complete");
}

export function useStations(): {
  data: Payload | null;
  /** Server clock minus this one, in ms, as of the last poll. */
  skew: number;
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<{ data: Payload | null; skew: number }>({
    data: null,
    skew: 0,
  });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/control/stations", { cache: "no-store" });
      if (!res.ok) return;
      const payload = (await res.json()) as Payload;
      setState({ data: payload, skew: Date.parse(payload.serverNow) - Date.now() });
    } catch {
      // A missed poll is not an event; the next one will land.
    }
  }, []);

  useEffect(() => {
    const first = window.setTimeout(() => void refresh(), 0);
    const poll = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [refresh]);

  return { data: state.data, skew: state.skew, refresh };
}

export async function resolveHelp(key: string): Promise<boolean> {
  try {
    const res = await fetch("/api/control/stations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default function StationBoard() {
  const { data, skew, refresh } = useStations();
  // This machine's clock, advanced once a second so "ago" counts up between
  // polls. Zero until the first tick; until then the server's own timestamp
  // stands in for "now".
  const [now, setNow] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  const resolve = async (key: string) => {
    setBusy(key);
    await resolveHelp(key);
    await refresh();
    setBusy(null);
  };

  const nowServer = now > 0 ? now + skew : data ? Date.parse(data.serverNow) : 0;
  const rows = (data?.stations ?? []).map((row) => {
    const updatedS = Math.max(0, (nowServer - Date.parse(row.updatedAt)) / 1000);
    const done = isDone(row);
    return {
      ...row,
      updatedS,
      done,
      quiet: !done && updatedS >= QUIET_S && updatedS < STALLED_S,
      stalled: !done && updatedS >= STALLED_S,
    };
  });
  const help = rows.filter((r) => r.needsHelp).length;

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Rating stations</h2>
        <span className="chip bg-stone-100 text-stone-700">{rows.length} today</span>
        {help > 0 && (
          <span className="chip bg-badger-soft text-badger">🖐 {help} need help</span>
        )}
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Live from the Lab Suite rating stations. A station appears once its setup is
        done; quiet too long while unfinished turns amber, then red.
      </p>

      {data === null ? (
        <div className="card p-6 text-ink-soft">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="card p-6 text-ink-soft">No rating station has reported today.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((row) => (
            <li
              key={row.stationKey}
              className={`flex flex-wrap items-center gap-3 px-5 py-3 ${
                row.needsHelp ? "bg-badger-soft" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {row.needsHelp && "🖐 "}
                  {row.label || row.stationKey}
                </p>
                <p className="truncate text-sm text-ink-soft">{row.stage}</p>
              </div>
              {row.percent !== null && (
                <div className="relative h-4 w-32 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className="h-full bg-badger"
                    style={{ width: `${row.percent}%` }}
                  />
                  <span className="absolute inset-0 text-center text-[10px] font-semibold leading-4">
                    {row.percent}%
                  </span>
                </div>
              )}
              <span
                className={`text-xs ${
                  row.stalled ? "text-red-700" : row.quiet ? "text-amber-700" : "text-ink-soft"
                }`}
              >
                {ago(row.updatedS)}
              </span>
              {row.needsHelp && (
                <button
                  type="button"
                  onClick={() => void resolve(row.stationKey)}
                  disabled={busy === row.stationKey}
                  className="btn-primary px-4 py-1.5 text-xs"
                >
                  {busy === row.stationKey ? "Resolving…" : "Resolve"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
