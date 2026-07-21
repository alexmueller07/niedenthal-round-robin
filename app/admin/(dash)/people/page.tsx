// PEOPLE — participants, research assistants, and the email log on one page.
// Replaces the separate "Participants" and "Emails" tabs plus the RA roster
// that used to live on the shifts page.

import { requireAdminPage } from "@/lib/admin-guard";
import { listEmailLog } from "@/lib/db";
import { isLive } from "@/lib/engine";
import { formatDateShort } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";
import EmailRow from "./EmailRow";
import ParticipantRow from "./ParticipantRow";
import RaManager from "./RaManager";

export const dynamic = "force-dynamic";

/** Most recent messages; the full history lives in the database. */
const EMAIL_LIMIT = 50;

export default async function PeoplePage() {
  await requireAdminPage();
  const [{ participants, assignments, slots, ras, raShiftPreferences, snapshot }, emails] =
    await Promise.all([loadFullState(), listEmailLog(EMAIL_LIMIT)]);

  const slotById = new Map(slots.map((s) => [s.id, s]));

  const availabilityCount = new Map<string, number>();
  for (const { participantId, slotId } of snapshot.availability) {
    const slot = slotById.get(slotId);
    if (slot && slot.date >= snapshot.today && slot.status !== "canceled") {
      availabilityCount.set(participantId, (availabilityCount.get(participantId) ?? 0) + 1);
    }
  }

  const rows = participants.map((p) => {
    const mine = assignments.filter((a) => a.participantId === p.id);
    const liveAssignment = mine.find((a) => {
      const slot = slotById.get(a.slotId);
      return isLive(a.status) && slot !== undefined && slot.date >= snapshot.today;
    });
    const liveSlot = liveAssignment ? slotById.get(liveAssignment.slotId) : undefined;
    return {
      participant: p,
      availability: availabilityCount.get(p.id) ?? 0,
      attended: mine.filter((a) => a.status === "attended").length,
      noShows: mine.filter((a) => a.status === "no_show").length,
      currentSession: liveSlot
        ? `${formatDateShort(liveSlot.date)} (${liveAssignment!.status})`
        : null,
    };
  });

  const offeredCountByRa: Record<string, number> = {};
  for (const { raId } of raShiftPreferences) {
    offeredCountByRa[raId] = (offeredCountByRa[raId] ?? 0) + 1;
  }
  const awaitingRas = ras.filter((r) => r.active && r.availabilitySubmittedAt === null);

  const manual = emails.filter((e) => e.status === "manual" || e.status === "failed");
  const hasMailer = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">People</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Participants, the RA team, and every message the app has sent.
        </p>
      </div>

      {/* ------------------------------------------------------ participants */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Participants</h2>
          <p className="text-sm text-ink-soft">
            {rows.length} signed up · availability counts upcoming sessions only
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            Nobody has signed up yet. Send participants the portal link — the site root
            URL — via SONA or email.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-soft">
                  <th className="p-4 font-semibold">Participant</th>
                  <th className="p-4 font-semibold">Availability</th>
                  <th className="p-4 font-semibold">Current session</th>
                  <th className="p-4 font-semibold">History</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <ParticipantRow key={row.participant.id} {...row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* --------------------------------------------------------------- RAs */}
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-bold">Research assistants</h2>
          {awaitingRas.length > 0 && (
            <p className="text-sm text-amber-700">
              {awaitingRas.length} haven&apos;t submitted availability:{" "}
              {awaitingRas.map((r) => r.name).join(", ")}
            </p>
          )}
        </div>
        <RaManager ras={ras} offeredCountByRa={offeredCountByRa} />
      </section>

      {/* ------------------------------------------------------------ emails */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-bold">Emails</h2>
          <p className="mt-1 text-sm text-ink-soft">
            {hasMailer
              ? "Automatic sending is on (Resend)."
              : "No mail service configured — every email lands here for manual sending."}
            {manual.length > 0 &&
              ` ${manual.length} message${manual.length === 1 ? " needs" : "s need"} a manual send: copy the body into the lab mail account.`}
          </p>
        </div>
        {emails.length === 0 ? (
          <div className="card p-6 text-ink-soft">
            Nothing yet — emails appear here when the scheduler sends invitations.
          </div>
        ) : (
          <ul className="card divide-y divide-line">
            {emails.map((entry) => (
              <EmailRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
