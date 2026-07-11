import { requireAdminPage } from "@/lib/admin-guard";
import { loadFullState } from "@/lib/snapshot";
import ScheduleRunner from "./ScheduleRunner";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  await requireAdminPage();
  const { settings } = await loadFullState();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Scheduler</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The engine matches participant availability against RA-covered slots and
          proposes sessions of {settings.groupMin}–{settings.groupMax} (plus{" "}
          {settings.overrecruit} alternate{settings.overrecruit === 1 ? "" : "s"} as
          no-show insurance). Nothing is saved or emailed until you approve.
        </p>
      </div>

      <ScheduleRunner />

      <section className="card p-6">
        <h2 className="mb-1 font-bold">Engine settings</h2>
        <p className="mb-4 text-sm text-ink-soft">
          The seed makes every run reproducible — change it only to get a different
          random tie-break order.
        </p>
        <SettingsForm settings={settings} />
      </section>
    </div>
  );
}
