import { requireAdminPage } from "@/lib/admin-guard";
import { loadFullState } from "@/lib/snapshot";
import RaGrid from "./RaGrid";
import RaManager from "./RaManager";
import SemesterPanel from "./SemesterPanel";
import ShiftAssignmentGrid from "./ShiftAssignmentGrid";
import SlotCreatePanel from "./SlotCreatePanel";
import WeeklyScheduleManager from "./WeeklyScheduleManager";

export const dynamic = "force-dynamic";

/** How far ahead the drag calendar lets RAs post one-off slots. */
const CALENDAR_DAYS = 21;

function upcomingDates(from: string, count: number): string[] {
  const [y, m, d] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(y, m - 1, d + i);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate()
    ).padStart(2, "0")}`;
  });
}

export default async function SlotsPage() {
  await requireAdminPage();
  const { slots, ras, raAvailability, weeklyShifts, raShifts, settings, snapshot } =
    await loadFullState();

  const activeRas = ras.filter((r) => r.active);
  const activeShiftCount = weeklyShifts.filter((s) => s.active).length;

  const existingSessions = slots.filter(
    (s) =>
      s.shiftId !== null &&
      s.status !== "canceled" &&
      s.date >= settings.semesterStart &&
      s.date <= settings.semesterEnd
  ).length;

  // The per-slot coverage grid is only for one-off slots (pilots / follow-ups):
  // shift-generated slots get their coverage from the assignment grid above.
  const oneOffSlots = slots
    .filter((s) => s.shiftId === null && s.date >= snapshot.today && s.status !== "canceled")
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Shifts &amp; RAs</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Set the weekly schedule once, assign each RA to their standing shifts, then
          generate the semester&apos;s sessions. Shifts need {settings.minRas} RA
          {settings.minRas === 1 ? "" : "s"} before the scheduler will fill them.
        </p>
      </div>

      <section className="card p-6">
        <h2 className="mb-4 font-bold">Weekly schedule</h2>
        <WeeklyScheduleManager shifts={weeklyShifts} />
      </section>

      <section className="card p-6">
        <h2 className="mb-4 font-bold">Research assistants</h2>
        <RaManager ras={ras} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Shift assignments</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Who staffs each shift, every week, all semester. Swaps for a one-off conflict
          are handled by email, not here.
        </p>
        <ShiftAssignmentGrid
          shifts={weeklyShifts}
          ras={activeRas}
          assignments={raShifts}
          minRas={settings.minRas}
        />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Generate the semester</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Turn the weekly shifts into dated sessions participants can sign up for.
        </p>
        <div className="card p-6">
          <SemesterPanel
            semesterStart={settings.semesterStart}
            semesterEnd={settings.semesterEnd}
            existingSessions={existingSessions}
            activeShiftCount={activeShiftCount}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">One-off sessions</h2>
        <p className="mb-3 text-sm text-ink-soft">
          For pilots, friends-and-family runs, or make-up sessions outside the weekly
          schedule. Staff these with the coverage grid below.
        </p>
        <SlotCreatePanel dates={upcomingDates(snapshot.today, CALENDAR_DAYS)} />
      </section>

      {oneOffSlots.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">One-off session coverage</h2>
          <RaGrid
            slots={oneOffSlots}
            ras={activeRas}
            availability={raAvailability}
            minRas={settings.minRas}
          />
        </section>
      )}
    </div>
  );
}
