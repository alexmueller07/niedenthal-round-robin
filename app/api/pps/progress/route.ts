// Progress reports from the PPS app, so the control center can show where each
// participant is without an RA walking the room and asking.
//
// Keyed by email, which is what both systems already share. Authenticated with
// a shared secret because the PPS app is a desktop application, not a browser
// with a cookie.

import { checkPpsSecret } from "@/lib/control-guard";
import { findLiveAssignmentByEmail, setAssignmentNeedsHelp, setPpsProgress } from "@/lib/db";

export async function POST(request: Request) {
  if (!checkPpsSecret(request)) return new Response("Unauthorized", { status: 401 });

  let body: {
    email?: string;
    stage?: string;
    percent?: number | null;
    needsHelp?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const stage = String(body.stage ?? "").slice(0, 60);
  if (!email || !stage) {
    return new Response("email and stage are required", { status: 400 });
  }

  const target = await findLiveAssignmentByEmail(email);
  if (!target) {
    return Response.json(
      { error: "No live session assignment for that participant." },
      { status: 404 }
    );
  }

  const raw = Number(body.percent);
  const percent = Number.isFinite(raw) ? Math.min(100, Math.max(0, Math.round(raw))) : null;

  await setPpsProgress(target.assignmentId, stage, percent);

  // The PPS app can also raise the same help flag a participant or RA raises,
  // so a stuck participant surfaces in one queue rather than two.
  if (body.needsHelp === true) await setAssignmentNeedsHelp(target.assignmentId, true);

  return Response.json({ ok: true, slotId: target.slotId });
}
