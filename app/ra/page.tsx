// RA availability portal. Separate from /admin on purpose: an RA reporting
// when they're free shouldn't need the shared lab password.

import { getRaSession } from "@/lib/auth";
import { getRaById, getRaShiftPreferences, listWeeklyShifts } from "@/lib/db";
import RaAvailability from "./RaAvailability";
import RaSignIn from "./RaSignIn";

export const dynamic = "force-dynamic";

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

  const [shifts, selectedShiftIds] = await Promise.all([
    listWeeklyShifts(),
    getRaShiftPreferences(ra.id),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
      <RaAvailability
        raName={ra.name.split(" ")[0]}
        shifts={shifts}
        selectedShiftIds={selectedShiftIds}
        submittedAt={ra.availabilitySubmittedAt}
      />
    </main>
  );
}
