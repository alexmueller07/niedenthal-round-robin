// Rating-station status reports, as the Control Center receives them.
//
// Lab Suite 1.5.0 removed the participant email check-in, so a station can no
// longer be matched to a scheduled assignment by email (what /api/pps/progress
// does). It reports under its own key instead — `p-<study ID>` — with a label
// an RA can read ("Green (Left) · P0123 · Dyad 014 · R2"), and the Control
// Center shows those rows on their own board. Nothing here is study data.

export const STATION_KEY_MAX = 80;
export const STATION_LABEL_MAX = 120;
export const STATION_STAGE_MAX = 120;
/** A row is on today's board if it reported within this long. */
export const STATION_FRESH_HOURS = 12;

export interface StationReport {
  stationKey: string;
  label: string;
  stage: string;
  percent: number | null;
  /** true raises the help flag, false lowers it, null leaves it alone. */
  help: boolean | null;
}

export interface StationRow {
  stationKey: string;
  label: string;
  stage: string;
  percent: number | null;
  needsHelp: boolean;
  helpRequestedAt: string | null;
  updatedAt: string;
}

const KEY_RE = /^[A-Za-z0-9._-]+$/;

/** Validates a POST body from a station. Returns null when it is unusable. */
export function parseStationReport(body: unknown): StationReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const stationKey = String(b.stationKey ?? "").trim().toLowerCase();
  if (!stationKey || stationKey.length > STATION_KEY_MAX || !KEY_RE.test(stationKey)) {
    return null;
  }
  const stage = String(b.stage ?? "").trim().slice(0, STATION_STAGE_MAX);
  if (!stage) return null;
  const label = String(b.label ?? "").trim().slice(0, STATION_LABEL_MAX);
  const raw = b.percent == null ? NaN : Number(b.percent);
  const percent = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : null;
  const help = b.needsHelp === true ? true : b.helpCleared === true ? false : null;
  return { stationKey, label, stage, percent, help };
}

/** The key a station polls with (GET ?key=), or null if it is not one. */
export function parseStationKey(raw: string | null): string | null {
  const key = (raw ?? "").trim().toLowerCase();
  return key && key.length <= STATION_KEY_MAX && KEY_RE.test(key) ? key : null;
}

/** Help first, then the most recently heard from. */
export function sortStations(rows: readonly StationRow[]): StationRow[] {
  return [...rows].sort((a, b) => {
    if (a.needsHelp !== b.needsHelp) return a.needsHelp ? -1 : 1;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  });
}
