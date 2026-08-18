// Every stored conversation from today's sessions, for the rating stations.
//
// The primary lookup (/api/pps/recordings?email=) keys on the participant's
// own email, which is right when the person at the station signed in as
// themselves. It falls down the moment an RA runs the station under a test
// address, a typo, or a walk-in who was never on the schedule — and then the
// station has no way to reach a recording that plainly exists.
//
// This is the fallback that keeps the station out of that dead end: given a
// session (or just "today"), here is every conversation that has actually
// been recorded and stored, with the pair who had it. The station shows them
// and the RA picks.

import { checkPpsSecret } from "@/lib/control-guard";
import { listParticipantsByIds, listRecordingsForSlot, listSlots } from "@/lib/db";
import { todayInMadison } from "@/lib/format";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!checkPpsSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const slotId = new URL(request.url).searchParams.get("slotId");

  // A window, not a single day. "Today" is the wrong unit for two reasons:
  // a session that runs late crosses midnight and instantly disappears from
  // its own stations, and a participant who comes back to rate a
  // conversation from an earlier visit is the normal case in this study, not
  // an edge one. Fourteen days covers both without turning this into a
  // list of every recording the lab has ever made.
  const WINDOW_DAYS = 14;
  const earliest = new Date(Date.parse(`${todayInMadison()}T00:00:00Z`));
  earliest.setUTCDate(earliest.getUTCDate() - WINDOW_DAYS);
  const from = earliest.toISOString().slice(0, 10);

  const slots = (await listSlots())
    .filter((slot) =>
      slotId
        ? slot.id === slotId
        : slot.date >= from && slot.status !== "canceled"
    )
    // Newest first, so the conversation that just finished is the first
    // thing a station offers.
    .sort((a, b) => b.date.localeCompare(a.date));

  const recordings = (
    await Promise.all(slots.map((slot) => listRecordingsForSlot(slot.id)))
  )
    .flat()
    .filter((r) => r.status === "stored");

  const names = new Map(
    (
      await listParticipantsByIds([
        ...new Set(
          recordings
            .flatMap((r) => [r.participantA, r.participantB])
            .filter((id): id is string => id !== null)
        ),
      ])
    ).map((p) => [p.id, p])
  );
  const dateBySlot = new Map(slots.map((s) => [s.id, s.date]));
  const nameOf = (id: string | null) =>
    (id && names.get(id)?.fullName) || "Unknown participant";

  return Response.json({
    clips: recordings.map((r) => ({
      recordingId: r.id,
      slotId: r.slotId,
      sessionDate: dateBySlot.get(r.slotId) ?? null,
      round: r.round,
      roomIndex: r.roomIndex,
      durationMs: r.durationMs,
      mimeType: r.mimeType,
      // Both names, because at this point the station does not know which of
      // the pair is sitting in front of it — the RA reads the label and picks.
      partner: {
        id: r.participantB ?? r.participantA ?? "",
        fullName: `${nameOf(r.participantA)} & ${nameOf(r.participantB)}`,
        email: "",
      },
      url: `/api/recordings/${r.id}/file`,
      storageKey: r.storageKey,
      sha256: r.integrity?.sha256 ?? null,
    })),
  });
}
