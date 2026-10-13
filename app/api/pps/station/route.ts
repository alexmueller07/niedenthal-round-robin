// Rating-station status, keyed by the station rather than by an email.
//
// Lab Suite 1.5.0 has no participant check-in, so it cannot use
// /api/pps/progress (which matches an email to a scheduled assignment). It
// reports here under `p-<study ID>` instead: POST on every step and on the
// help button, GET while its "Researcher notified" notice is up, so an RA
// resolving the request on the Control Center clears it on the station too.
//
// Shared-secret auth, like every /api/pps route: the caller is a desktop app.

import { checkPpsSecret } from "@/lib/control-guard";
import { getStationStatus, upsertStationStatus } from "@/lib/db";
import { parseStationKey, parseStationReport } from "@/lib/stations";

export async function POST(request: Request) {
  if (!checkPpsSecret(request)) return new Response("Unauthorized", { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  const report = parseStationReport(body);
  if (!report) {
    return new Response("stationKey and stage are required", { status: 400 });
  }

  await upsertStationStatus(report);
  return Response.json({ ok: true });
}

export async function GET(request: Request) {
  if (!checkPpsSecret(request)) return new Response("Unauthorized", { status: 401 });
  const key = parseStationKey(new URL(request.url).searchParams.get("key"));
  if (!key) return new Response("key is required", { status: 400 });

  const row = await getStationStatus(key);
  // A station the server has never heard of has nothing open.
  return Response.json({ needsHelp: row?.needsHelp ?? false });
}
