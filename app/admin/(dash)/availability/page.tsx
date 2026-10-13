// AVAILABILITY — every RA's full painted week, for planning shifts.
//
// Eddie, 2026-10-13: the head RAs want to see everything an RA entered, not
// only the times that happen to line up with a shift that is posted now. The
// Schedule page answers "who offered this shift"; this page answers "when is
// anybody free at all", which is the question you ask before a shift exists.

import { requireAdminPage } from "@/lib/admin-guard";
import { listRaAvailabilityBlocks, listRas } from "@/lib/db";
import type { WeeklyBlock } from "@/lib/availability";
import AvailabilityBrowser, { type RaWeek } from "./AvailabilityBrowser";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage() {
  await requireAdminPage();
  const [ras, blocks] = await Promise.all([listRas(), listRaAvailabilityBlocks()]);

  const byRa = new Map<string, WeeklyBlock[]>();
  for (const { raId, ...block } of blocks) {
    const list = byRa.get(raId) ?? [];
    list.push(block);
    byRa.set(raId, list);
  }

  const weeks: RaWeek[] = ras
    .filter((ra) => ra.active)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((ra) => ({
      raId: ra.id,
      name: ra.name,
      submittedAt: ra.availabilitySubmittedAt,
      blocks: byRa.get(ra.id) ?? [],
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">RA availability</h1>
        <p className="text-sm text-ink-soft">
          Everything each RA painted on their availability page, whether or not it
          matches a posted shift. RAs update it themselves at /ra.
        </p>
      </div>
      <AvailabilityBrowser weeks={weeks} />
    </div>
  );
}
