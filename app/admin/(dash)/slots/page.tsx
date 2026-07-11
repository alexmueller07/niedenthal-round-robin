import { requireAdminPage } from "@/lib/admin-guard";
import { loadFullState } from "@/lib/snapshot";
import RaGrid from "./RaGrid";
import RaManager from "./RaManager";
import SlotCreatePanel from "./SlotCreatePanel";

export const dynamic = "force-dynamic";

/** How far ahead the drag calendar lets RAs post slots. */
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
  const { slots, ras, raAvailability, settings, snapshot } = await loadFullState();

  const upcoming = slots
    .filter((s) => s.date >= snapshot.today && s.status !== "canceled")
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Slots &amp; RAs</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Post candidate session times, then mark which RAs can staff each one. Slots
          need {settings.minRas} RA{settings.minRas === 1 ? "" : "s"} before the
          scheduler will fill them.
        </p>
      </div>

      <SlotCreatePanel dates={upcomingDates(snapshot.today, CALENDAR_DAYS)} />

      <section className="card p-6">
        <h2 className="mb-4 font-bold">Research assistants</h2>
        <RaManager ras={ras} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold">RA coverage</h2>
        <RaGrid
          slots={upcoming}
          ras={ras.filter((r) => r.active)}
          availability={raAvailability}
          minRas={settings.minRas}
        />
      </section>
    </div>
  );
}
