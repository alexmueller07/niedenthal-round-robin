// THE PPS INTEGRATION SEAM.
//
// Given a participant, return the conversation clips they appear in, in round
// order, each with an authenticated playback URL. That is the whole routing
// answer for the rating task: the PPS app asks "what does this person watch?"
// and gets back exactly their own conversations, because every recording was
// stamped with its dyad from the rotation at capture time.
//
// Two callers:
//   - the PPS desktop app, with the shared secret, resolving by email (the key
//     both systems already share)
//   - a participant's own browser at their rating station, by session cookie

import { checkPpsSecret } from "@/lib/control-guard";
import { getParticipantSession } from "@/lib/auth";
import {
  getParticipantByEmail,
  getParticipantById,
  getSlot,
  listParticipantsByIds,
  listRecordingsForParticipant,
} from "@/lib/db";
import type { Recording } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = new URL(request.url).searchParams.get("email");

  const participant = checkPpsSecret(request)
    ? email
      ? await getParticipantByEmail(email)
      : null
    : await (async () => {
        const id = await getParticipantSession();
        return id ? getParticipantById(id) : null;
      })();

  if (!participant) {
    // Don't distinguish "bad secret" from "unknown participant" to a caller
    // that failed auth; an authenticated caller gets the useful 404.
    const authed = checkPpsSecret(request) || (await getParticipantSession()) !== null;
    return new Response(authed ? "Participant not found" : "Unauthorized", {
      status: authed ? 404 : 401,
    });
  }

  const recordings = await listRecordingsForParticipant(participant.id);

  // Rounds come back already ordered per session; annotate each with who the
  // participant was talking to, which the rating task needs for its prompts.
  //
  // The partner is read off the dyad stamped on the recording at capture time
  // — never re-derived from the slot's live rotation, which can change after
  // the fact and would then disagree with what was actually recorded.
  const partnerIdFor = (r: Recording): string | null =>
    r.participantA === participant.id ? r.participantB : r.participantA;

  const partnerIds = [
    ...new Set(
      recordings.map(partnerIdFor).filter((id): id is string => id !== null)
    ),
  ];
  const slotIds = [...new Set(recordings.map((r) => r.slotId))];
  const [partners, slotRows] = await Promise.all([
    listParticipantsByIds(partnerIds),
    Promise.all(slotIds.map((id) => getSlot(id))),
  ]);
  const partnerById = new Map(partners.map((p) => [p.id, p]));
  const dateBySlot = new Map(
    slotRows.flatMap((s) => (s ? [[s.id, s.date] as const] : []))
  );

  const clips = recordings.map((r) => {
    const partnerId = partnerIdFor(r);
    const partner = partnerId ? partnerById.get(partnerId) ?? null : null;
    return {
      recordingId: r.id,
      slotId: r.slotId,
      sessionDate: dateBySlot.get(r.slotId) ?? null,
      round: r.round,
      roomIndex: r.roomIndex,
      durationMs: r.durationMs,
      mimeType: r.mimeType,
      partner: partner
        ? { id: partner.id, fullName: partner.fullName, email: partner.email }
        : null,
      url: `/api/recordings/${r.id}/file`,
    };
  });

  return Response.json({
    participant: {
      id: participant.id,
      email: participant.email,
      fullName: participant.fullName,
    },
    clips,
  });
}
