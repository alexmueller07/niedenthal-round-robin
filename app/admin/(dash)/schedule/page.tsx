// SCHEDULE — the whole "when do we run, who staffs it, who's coming" flow on
// one page, as three numbered steps. Replaces the old "Shifts & RAs" tab plus
// the separate "Scheduler" tab; the engine's proposal is now a step here rather
// than somewhere else you had to remember to visit.

import { requireAdminPage } from "@/lib/admin-guard";
import { isLive } from "@/lib/engine";
import { loadFullState } from "@/lib/snapshot";
import RaGrid from "./RaGrid";
import ScheduleRunner from "./ScheduleRunner";
import SemesterCalendar from "./SemesterCalendar";
import SemesterPanel from "./SemesterPanel";
import SettingsForm from "./SettingsForm";
import ShiftAssignmentGrid from "./ShiftAssignmentGrid";
import WeeklyScheduleManager from "./WeeklyScheduleManager";

export const dynamic = "force-dynamic";

function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-badger text-sm font-bold text-white">
          {n}
        </span>
        <div>
          <h2 className="text-lg font-bold">{title}</h2>
          <p className="text-sm text-ink-soft">{hint}</p>
        </div>
      </div>
      <div className="sm:pl-10">{children}</div>
    </section>
  );
}

export default async function SchedulePage() {
  await requireAdminPage();
  const {
    slots,
    ras,
    assignments,
    raAvailability,
    weeklyShifts,
    raShifts,
    raShiftPreferences,
    blackoutDates,
    settings,
    snapshot,
  } = await loadFullState();

  const activeRas = ras.filter((r) => r.active);
  const activeShiftCount = weeklyShifts.filter((s) => s.active).length;

  const generated = slots.filter(
    (s) =>
      s.shiftId !== null &&
      s.status !== "canceled" &&
      s.date >= settings.semesterStart &&
      s.date <= settings.semesterEnd
  );

  // Sessions somebody is counting on: removing these has to email people
  // rather than delete quietly.
  const withPeople = new Set(
    assignments
      .filter((a) => isLive(a.status) || a.status === "attended")
      .map((a) => a.slotId)
  );
  const generatedWithPeople = generated.filter((s) => withPeople.has(s.id));

  // The per-slot coverage grid is only for follow-up sessions: shift-generated
  // sessions get their coverage from the assignment grid in step 2.
  const oneOffSlots = slots
    .filter((s) => s.shiftId === null && s.date >= snapshot.today && s.status !== "canceled")
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Paint the weekly schedule, say who staffs it, then publish the semester.
        </p>
      </div>

      <Step
        n={1}
        title="When the lab runs"
        hint="The same weekly schedule repeats all semester. Drag to paint the times."
      >
        <WeeklyScheduleManager shifts={weeklyShifts} />
      </Step>

      <Step
        n={2}
        title="Who staffs it"
        hint={
          settings.requireHeadRa
            ? `Every shift needs ${settings.minRas} RAs and a head RA before the scheduler will fill its sessions.`
            : `Every shift needs ${settings.minRas} RAs before the scheduler will fill its sessions. Mark a head RA with ☆ — sessions without one still fill, but get flagged.`
        }
      >
        <ShiftAssignmentGrid
          shifts={weeklyShifts}
          ras={activeRas}
          assignments={raShifts}
          preferences={raShiftPreferences}
          minRas={settings.minRas}
        />
      </Step>

      <Step
        n={3}
        title="Publish the semester"
        hint="Turn the weekly shifts into dated sessions participants can sign up for."
      >
        <div className="space-y-6">
          <div className="card p-6">
            <SemesterPanel
              semesterStart={settings.semesterStart}
              semesterEnd={settings.semesterEnd}
              generatedSlotIds={generated.map((s) => s.id)}
              withPeopleCount={generatedWithPeople.length}
              activeShiftCount={activeShiftCount}
            />
          </div>

          <div className="card p-6">
            <h3 className="mb-1 font-bold">Calendar &amp; days off</h3>
            <p className="mb-4 text-sm text-ink-soft">
              Click a day to skip it — holidays, breaks, finals week. Skipping a day
              removes the sessions already generated on it.
            </p>
            <SemesterCalendar
              semesterStart={settings.semesterStart}
              semesterEnd={settings.semesterEnd}
              blackoutDates={blackoutDates}
              sessions={generated.map((s) => ({ id: s.id, date: s.date }))}
              sessionsWithPeople={generatedWithPeople.map((s) => s.id)}
              today={snapshot.today}
            />
          </div>

          <div>
            <h3 className="mb-1 font-bold">Fill sessions</h3>
            <p className="mb-3 text-sm text-ink-soft">
              Matches participant availability against staffed sessions and proposes
              groups of {settings.groupMin}–{settings.groupMax} plus {settings.overrecruit}{" "}
              alternate{settings.overrecruit === 1 ? "" : "s"}. Nothing is saved or emailed
              until you approve.
            </p>
            <ScheduleRunner />
          </div>
        </div>
      </Step>

      <details className="card p-6">
        <summary className="cursor-pointer font-bold">Advanced</summary>
        <div className="mt-6 space-y-8">
          <div>
            <h3 className="mb-1 font-bold">Engine settings</h3>
            <p className="mb-4 text-sm text-ink-soft">
              The seed makes every run reproducible — change it only to get a different
              random tie-break order.
            </p>
            <SettingsForm settings={settings} />
          </div>

          {oneOffSlots.length > 0 && (
            <div>
              <h3 className="mb-1 font-bold">Follow-up session coverage</h3>
              <p className="mb-3 text-sm text-ink-soft">
                Follow-ups are created from a session page and sit outside the weekly
                schedule, so staff them here.
              </p>
              <RaGrid
                slots={oneOffSlots}
                ras={activeRas}
                availability={raAvailability}
                minRas={settings.minRas}
              />
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
