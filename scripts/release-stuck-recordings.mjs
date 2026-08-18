// Releases recording rows that are still "in progress" but cannot be.
//
// A recorder that dies before closing its row leaves one behind, and until it
// is released Round Robin refuses the room's next take — the takes still
// record, they just come back unlinked, and the rating stations never find
// them. The app now closes its own row when a take fails, and the server
// expires a row nobody has closed after an hour. This is the manual lever for
// anything stranded before those existed.
//
//   node scripts/release-stuck-recordings.mjs          # show what is stuck
//   node scripts/release-stuck-recordings.mjs --apply  # mark them failed

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

if (!process.env.DATABASE_URL) {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const apply = process.argv.includes("--apply");
const sql = neon(process.env.DATABASE_URL);

const stuck = await sql`
  SELECT id, slot_id, round, room_index, status,
         ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60) AS age_minutes
    FROM recordings
   WHERE status IN ('recording', 'uploading')
   ORDER BY started_at`;

if (stuck.length === 0) {
  console.log("Nothing is stuck — every recording row is closed.");
  process.exit(0);
}

for (const r of stuck) {
  console.log(
    `round ${r.round} room ${r.room_index} — ${r.status}, ${r.age_minutes} min old  (${r.id})`
  );
}

if (!apply) {
  console.log(`\n${stuck.length} row(s) would be marked failed. Re-run with --apply.`);
  process.exit(0);
}

// "failed" rather than deleted: the take really was attempted, and the Control
// Center's coverage matrix should say so rather than show a gap.
await sql`
  UPDATE recordings
     SET status = 'failed', ended_at = now()
   WHERE status IN ('recording', 'uploading')`;
console.log(`\nMarked ${stuck.length} row(s) failed. Those rooms accept takes again.`);
