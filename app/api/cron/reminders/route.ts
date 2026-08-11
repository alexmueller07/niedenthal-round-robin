// Daily reminder cron (vercel.json schedules this every morning). Sends a
// reminder to everyone invited/confirmed for a session happening tomorrow.

import { listAssignments, listParticipants, listSlots } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isLive } from "@/lib/engine";
import { todayInMadison } from "@/lib/format";
import { addDays } from "@/lib/roster";
import { reminderEmail } from "@/lib/templates";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // The shared Madison-date helpers, not a locale-string round-trip — parsing
  // toLocaleString output through the Date constructor depends on the server's
  // locale data and can shift the day.
  const tomorrow = addDays(todayInMadison(), 1);
  const [slots, assignments, participants] = await Promise.all([
    listSlots(),
    listAssignments(),
    listParticipants(),
  ]);

  const targetSlots = slots.filter(
    (s) => s.date === tomorrow && (s.status === "scheduled" || s.status === "open")
  );
  const participantById = new Map(participants.map((p) => [p.id, p]));

  let sent = 0;
  for (const slot of targetSlots) {
    for (const a of assignments) {
      if (a.slotId !== slot.id || !isLive(a.status)) continue;
      const participant = participantById.get(a.participantId);
      if (!participant) continue;
      await sendEmail({
        toEmail: participant.email,
        participantId: participant.id,
        slotId: slot.id,
        content: reminderEmail(participant, slot),
      });
      sent += 1;
    }
  }

  return Response.json({ date: tomorrow, sessions: targetSlots.length, reminders: sent });
}
