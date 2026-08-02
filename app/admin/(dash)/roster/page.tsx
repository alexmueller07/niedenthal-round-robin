// ROSTER — who is working when, read-only.
//
// Deliberately not the Schedule page's assignment grid. That one is for setting
// staffing up; this one answers the question an RA actually asks during the
// week ("who's in on Tuesday, and who could cover for me?"). Same data, and
// nothing on this page can change it.

import { requireAdminPage } from "@/lib/admin-guard";
import { loadFullState } from "@/lib/snapshot";
import { buildWeeklyRoster, sessionsAhead } from "@/lib/roster";
import type { RosterPerson } from "@/lib/roster";
import WeeklyRoster from "@/app/components/WeeklyRoster";

export const dynamic = "force-dynamic";

/** How far ahead the dated-session list runs, and how many to fall back to. */
const UPCOMING_DAYS = 14;
const FALLBACK_SESSIONS = 6;

export default async function RosterPage() {
  await requireAdminPage();
  const { slots, ras, raShifts, raAvailability, weeklyShifts, settings, snapshot } =
    await loadFullState();

  const roster = buildWeeklyRoster(weeklyShifts, ras, raShifts);

  // Follow-up sessions have no weekly shift to inherit staff from, so their
  // per-slot availability is what covers them.
  const raById = new Map(ras.filter((r) => r.active).map((r) => [r.id, r]));
  const extraStaffBySlot = new Map<string, RosterPerson[]>();
  for (const { raId, slotId } of raAvailability) {
    const ra = raById.get(raId);
    if (!ra) continue;
    const list = extraStaffBySlot.get(slotId) ?? [];
    list.push({ id: ra.id, name: ra.name, email: ra.email, isHead: false });
    extraStaffBySlot.set(slotId, list);
  }

  const upcoming = sessionsAhead(
    slots,
    roster,
    snapshot.today,
    UPCOMING_DAYS,
    FALLBACK_SESSIONS,
    extraStaffBySlot
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Roster</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Who&apos;s working when. RAs see this same view on their portal — it&apos;s
          where they look for a sub. Change staffing on the Schedule page.
        </p>
      </div>

      <WeeklyRoster
        roster={roster}
        upcoming={upcoming.sessions}
        upcomingIsWindowed={upcoming.windowed}
        minRas={settings.minRas}
        today={snapshot.today}
      />
    </div>
  );
}
