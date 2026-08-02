// RA portal. Separate from /admin on purpose: an RA reporting when they're free
// shouldn't need the shared lab password.
//
// Three things, in the order an RA needs them (Reese, 2026-07-31): the links
// they open during a session, who's working when so they can find a sub, and
// the availability form they came here for originally.

import { getRaSession } from "@/lib/auth";
import {
  getRaById,
  getRaShiftPreferences,
  getSettings,
  listRaLinks,
  listRas,
  listRaShifts,
  listSlots,
  listWeeklyShifts,
} from "@/lib/db";
import { todayInMadison } from "@/lib/format";
import { buildWeeklyRoster, sessionsAhead } from "@/lib/roster";
import LinkList from "@/app/components/LinkList";
import WeeklyRoster from "@/app/components/WeeklyRoster";
import RaAvailability from "./RaAvailability";
import RaSignIn from "./RaSignIn";
import RaTabs from "./RaTabs";
import { signOutRa } from "./actions";

export const dynamic = "force-dynamic";

/** How far ahead the dated-session list runs, and how many to fall back to. */
const UPCOMING_DAYS = 14;
const FALLBACK_SESSIONS = 6;

export default async function RaPage() {
  const raId = await getRaSession();
  const ra = raId ? await getRaById(raId) : null;

  if (!ra || !ra.active) {
    return (
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12">
        <RaSignIn />
      </main>
    );
  }

  const [shifts, selectedShiftIds, links, ras, raShifts, slots, settings] =
    await Promise.all([
      listWeeklyShifts(),
      getRaShiftPreferences(ra.id),
      listRaLinks(),
      listRas(),
      listRaShifts(),
      listSlots(),
      getSettings(),
    ]);

  const today = todayInMadison();
  const roster = buildWeeklyRoster(shifts, ras, raShifts);
  const upcoming = sessionsAhead(slots, roster, today, UPCOMING_DAYS, FALLBACK_SESSIONS);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Hi {ra.name.split(" ")[0]}</h1>
        <form action={signOutRa}>
          <button type="submit" className="btn-ghost px-4 py-2 text-xs">
            Sign out
          </button>
        </form>
      </header>

      <RaTabs
        links={<LinkList links={links} />}
        roster={
          <WeeklyRoster
            roster={roster}
            upcoming={upcoming.sessions}
            upcomingIsWindowed={upcoming.windowed}
            minRas={settings.minRas}
            currentRaId={ra.id}
            today={today}
          />
        }
        availability={
          <RaAvailability
            shifts={shifts}
            selectedShiftIds={selectedShiftIds}
            submittedAt={ra.availabilitySubmittedAt}
          />
        }
      />
    </main>
  );
}
