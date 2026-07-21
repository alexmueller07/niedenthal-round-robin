// Access control for the control center's API surface.
//
// Live camera feeds and conversation recordings are participant data under IRB
// 2020-1657, so nothing here is ever reachable without a session. Two callers
// are legitimate:
//
//   - an RA (admin session) running the session: full access to a slot
//   - a participant (participant session): only their own slot, and only their
//     own recordings
//
// Anything else is refused.

import "server-only";
import { getParticipantSession, isAdmin } from "./auth";
import { listAssignmentsForSlot } from "./db";

export type ControlAccess =
  | { ok: true; role: "admin"; participantId: null }
  | { ok: true; role: "participant"; participantId: string }
  | { ok: false; status: 401 | 403 };

/**
 * Who is asking, and may they touch this session? Participants qualify only
 * while they hold a live or attended assignment on that exact slot.
 */
export async function checkSlotAccess(slotId: string): Promise<ControlAccess> {
  if (await isAdmin()) return { ok: true, role: "admin", participantId: null };

  const participantId = await getParticipantSession();
  if (!participantId) return { ok: false, status: 401 };

  const assignments = await listAssignmentsForSlot(slotId);
  const mine = assignments.find(
    (a) =>
      a.participantId === participantId &&
      (a.status === "invited" || a.status === "confirmed" || a.status === "attended")
  );
  if (!mine) return { ok: false, status: 403 };

  return { ok: true, role: "participant", participantId };
}

/** Admin-only endpoints (recording control, device registry for rooms). */
export async function requireAdminApi(): Promise<Response | null> {
  if (await isAdmin()) return null;
  return new Response("Unauthorized", { status: 401 });
}

export function denied(access: Extract<ControlAccess, { ok: false }>): Response {
  return new Response(access.status === 401 ? "Unauthorized" : "Forbidden", {
    status: access.status,
  });
}

/**
 * Shared-secret auth for the PPS app, which is a desktop application rather
 * than a browser with a cookie.
 */
export function checkPpsSecret(request: Request): boolean {
  const secret = process.env.PPS_SHARED_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}
