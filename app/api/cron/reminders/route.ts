// Daily reminder cron (vercel.json schedules this every morning). Sends a
// reminder to everyone invited/confirmed for a session happening tomorrow.

import { listAssignments, listParticipants, listSlots } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { isLive } from "@/lib/engine";
import { reminderEmail } from "@/lib/templates";

function tomorrowInMadison(): string {
  const now = new Date();
  const madison = new Date(now.toLocaleString("en-US", { timeZone: "America/Chicago" }));
  madison.setDate(madison.getDate() + 1);
  const y = madison.getFullYear();
  const m = String(madison.getMonth() + 1).padStart(2, "0");
  const d = String(madison.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const tomorrow = tomorrowInMadison();
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
