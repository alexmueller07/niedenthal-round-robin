import { getParticipantSession } from "@/lib/auth";
import {
  getAvailabilityForParticipant,
  getParticipantById,
  listAssignmentsForParticipant,
  listSlots,
} from "@/lib/db";
import { todayInMadison } from "@/lib/format";
import Portal from "./components/Portal";
import SignIn from "./components/SignIn";

export const dynamic = "force-dynamic";

export default async function Home() {
  const participantId = await getParticipantSession();
  if (!participantId) return <SignIn />;

  const participant = await getParticipantById(participantId);
  if (!participant) return <SignIn />;

  const [allSlots, availability, assignments] = await Promise.all([
    listSlots(),
    getAvailabilityForParticipant(participantId),
    listAssignmentsForParticipant(participantId),
  ]);

  const today = todayInMadison();
  const slotById = new Map(allSlots.map((s) => [s.id, s]));

  const openUpcoming = allSlots.filter((s) => s.status !== "canceled" && s.date >= today);

  const joined = assignments.flatMap((assignment) => {
    const slot = slotById.get(assignment.slotId);
    return slot ? [{ assignment, slot }] : [];
  });

  return (
    <Portal
      participant={participant}
      slots={openUpcoming}
      availability={availability}
      assignments={joined}
    />
  );
}
