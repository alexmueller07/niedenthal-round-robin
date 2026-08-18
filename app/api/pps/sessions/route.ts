// Sessions the Lab Recorder desktop app can record into.
//
// The recorder needs a slot id to open a recording, and slot ids are UUIDs — an
// RA is not going to type one correctly while two participants wait. This gives
// the app enough to render a dropdown and nothing more.
//
// Deliberately no participant information: which people are in which room is
// already answered by the dyad Round Robin stamps on the recording at capture
// time, and a desktop app on a lab machine has no reason to hold a roster.

import { checkPpsSecret } from "@/lib/control-guard";
import { listSlots } from "@/lib/db";
import { todayInMadison } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!checkPpsSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Today onwards. A recorder has no use for last month's sessions, and a
  // shorter list is a list an RA can actually pick from correctly.
  const today = todayInMadison();
  const slots = (await listSlots())
    .filter((slot) => slot.date >= today && slot.status !== "canceled")
    .slice(0, 50);

  return Response.json({
    sessions: slots.map((slot) => ({
      slotId: slot.id,
      date: slot.date,
      time: slot.startTime,
      roomCount: slot.roomCount,
      currentRound: slot.currentRound,
    })),
  });
}
