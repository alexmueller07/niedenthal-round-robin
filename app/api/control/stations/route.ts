// Admin side of the rating-station board: today's stations, and resolving a
// help request. Polled by StationBoard and the admin-wide help banner.

import { requireAdminApi } from "@/lib/control-guard";
import { listRecentStations, resolveStationHelp } from "@/lib/db";
import { STATION_FRESH_HOURS, parseStationKey, sortStations } from "@/lib/stations";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireAdminApi();
  if (denied) return denied;
  const stations = sortStations(await listRecentStations(STATION_FRESH_HOURS));
  return Response.json({ serverNow: new Date().toISOString(), stations });
}

export async function POST(request: Request) {
  const denied = await requireAdminApi();
  if (denied) return denied;
  let key: string | null = null;
  try {
    const body = (await request.json()) as { key?: unknown };
    key = parseStationKey(typeof body.key === "string" ? body.key : null);
  } catch {
    key = null;
  }
  if (!key) return new Response("key is required", { status: 400 });
  await resolveStationHelp(key);
  return Response.json({ ok: true });
}
