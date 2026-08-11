// The session's current round, fresh from the database.
//
// The room kiosk renders with the round current at page load, but the console
// can advance the session while that tab sits open between conversations. The
// round stamped onto a recording is what routes the clip to its participants,
// so the kiosk re-reads it at the moment it arms rather than trusting the
// page's snapshot.

import { requireAdminApi } from "@/lib/control-guard";
import { getSlot } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const unauthorized = await requireAdminApi();
  if (unauthorized) return unauthorized;

  const slotId = new URL(request.url).searchParams.get("slotId") ?? "";
  if (!slotId) return new Response("slotId is required", { status: 400 });

  const slot = await getSlot(slotId);
  if (!slot) return new Response("Session not found", { status: 404 });

  return Response.json({ currentRound: slot.currentRound });
}
