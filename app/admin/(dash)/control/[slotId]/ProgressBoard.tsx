"use client";

// The live participant board -- the part of the control center an RA
// actually watches during a session. Three things the old static list
// could not answer, answered here: is this number fresh (updated-ago,
// against the server clock), is someone stuck (quiet too long while
// unfinished), and who needs a human right now (help first, stalled
// second, everyone else alphabetically).
//
// Polling, not SSE: the signal stream is device-addressed WebRTC plumbing,
// and a 4-second poll of one JSON endpoint is two orders of magnitude
// cheaper than the camera path while feeling live. The poll pauses when
// the tab is hidden.

import { useCallback, useEffect, useRef, useState } from "react";

type Row = {
  assignmentId: string;
  name: string;
  status: string;
  liveStatus: string;
  needsHelp: boolean;
  ppsStage: string | null;
  ppsPercent: number | null;
  ppsUpdatedAt: string | null;
};

type Payload = {
  serverNow: string;
  currentRound: number;
  roster: Row[];
};

const POLL_MS = 4000;
const QUIET_S = 180; // no update this long, while unfinished -> amber
const STALLED_S = 360; // -> red

function ago(seconds: number): string {
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function isDone(row: Row): boolean {
  if (row.ppsPercent !== null && row.ppsPercent >= 100) return true;
  const stage = (row.ppsStage ?? "").toLowerCase();
  return stage.includes("done") || stage.includes("complete");
}

export default function ProgressBoard({
  slotId,
  initial,
}: {
  slotId: string;
  initial: Payload;
}) {
  const [data, setData] = useState<Payload>(initial);
  // Freshness math uses the server clock: skew = serverNow - receivedAt,
  // so "updated 8s ago" stays true even on a kiosk whose clock drifts.
  const skewRef = useRef(Date.parse(initial.serverNow) - Date.now());
  const [, forceTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/control/progress?slotId=${encodeURIComponent(slotId)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const payload = (await res.json()) as Payload;
      skewRef.current = Date.parse(payload.serverNow) - Date.now();
      setData(payload);
    } catch {
      // A missed poll is not an event; the freshness labels already show
      // the reader how old what they see is.
    }
  }, [slotId]);

  useEffect(() => {
    const poll = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, POLL_MS);
    // Re-render every second so the "ago" labels count up between polls.
    const tick = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [refresh]);

  const nowServer = Date.now() + skewRef.current;
  const rows = data.roster.map((row) => {
    const updatedS =
      row.ppsUpdatedAt !== null
        ? Math.max(0, (nowServer - Date.parse(row.ppsUpdatedAt)) / 1000)
        : null;
    const done = isDone(row);
    const quiet =
      !done && updatedS !== null && updatedS >= QUIET_S && updatedS < STALLED_S;
    const stalled = !done && updatedS !== null && updatedS >= STALLED_S;
    return { ...row, updatedS, done, quiet, stalled };
  });

  rows.sort((a, b) => {
    if (a.needsHelp !== b.needsHelp) return a.needsHelp ? -1 : 1;
    if (a.stalled !== b.stalled) return a.stalled ? -1 : 1;
    if (a.quiet !== b.quiet) return a.quiet ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const counts = {
    total: rows.length,
    help: rows.filter((r) => r.needsHelp).length,
    stalled: rows.filter((r) => r.stalled).length,
    done: rows.filter((r) => r.done).length,
  };

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold">Participant progress</h2>
        <span className="chip bg-stone-100 text-stone-700">
          {counts.total} in session
        </span>
        {counts.done > 0 && (
          <span className="chip bg-green-100 text-green-800">
            {counts.done} done
          </span>
        )}
        {counts.stalled > 0 && (
          <span className="chip bg-red-100 text-red-800">
            {counts.stalled} stalled
          </span>
        )}
        {counts.help > 0 && (
          <span className="chip bg-badger-soft text-badger">
            🖐 {counts.help} need help
          </span>
        )}
      </div>
      <p className="mb-3 text-sm text-ink-soft">
        Live from the PPS app, refreshed every few seconds. Quiet too long
        while unfinished turns amber, then red — walk over and check.
      </p>

      {rows.length === 0 ? (
        <div className="card p-6 text-ink-soft">Nobody is checked in yet.</div>
      ) : (
        <ul className="card divide-y divide-line">
          {rows.map((r) => (
            <li
              key={r.assignmentId}
              className={`flex flex-wrap items-center justify-between gap-3 p-4 ${
                r.stalled ? "bg-red-50" : r.quiet ? "bg-amber-50" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-medium">{r.name}</span>
                {r.status === "invited" && (
                  <span className="chip bg-stone-100 text-stone-500">
                    invited
                  </span>
                )}
                {r.needsHelp && (
                  <span className="chip animate-pulse bg-badger-soft text-badger">
                    🖐 needs help
                  </span>
                )}
                {r.done && (
                  <span className="chip bg-green-100 text-green-800">done ✓</span>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm text-ink">
                    {r.ppsStage ?? r.liveStatus.replace(/_/g, " ")}
                  </p>
                  <p
                    className={`text-xs ${
                      r.stalled
                        ? "font-semibold text-red-700"
                        : r.quiet
                          ? "font-semibold text-amber-700"
                          : "text-ink-soft"
                    }`}
                  >
                    {r.updatedS === null
                      ? "no signal yet"
                      : r.stalled
                        ? `stalled — ${ago(r.updatedS)}`
                        : r.quiet
                          ? `quiet — ${ago(r.updatedS)}`
                          : ago(r.updatedS)}
                  </p>
                </div>
                {r.ppsPercent !== null && (
                  <div
                    role="progressbar"
                    aria-valuenow={r.ppsPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="relative h-5 w-36 overflow-hidden rounded-full bg-stone-100"
                  >
                    <div
                      className={`h-full rounded-full ${
                        r.done ? "bg-green-600" : "bg-badger"
                      }`}
                      style={{ width: `${r.ppsPercent}%` }}
                    />
                    <span
                      className={`absolute inset-0 flex items-center justify-center text-[11px] font-semibold ${
                        r.ppsPercent >= 55 ? "text-white" : "text-ink"
                      }`}
                    >
                      {r.ppsPercent}%
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
