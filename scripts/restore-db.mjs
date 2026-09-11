// Put a backup taken by clear-db.mjs back.
//
// Usage: node scripts/restore-db.mjs "C:/lab-corpus/rr-backup/roundrobin-preclear-....json"
//
// Replaces everything: the target is emptied first, so restoring a backup gives
// you exactly the state that backup captured rather than a merge. Insert order
// follows the dependency order below so foreign keys are satisfied.
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/restore-db.mjs <backup.json> [--yes]");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const dump = JSON.parse(readFileSync(file, "utf8"));

// Parents before children. Anything not listed is restored afterwards in
// whatever order it appears, which is fine for tables nothing references.
const ORDER = [
  "settings", "participants", "ras", "weekly_shifts", "blackout_dates",
  "ra_shifts", "ra_shift_preferences", "slots", "ra_availability",
  "participant_availability", "assignments", "room_devices", "recordings",
  "signals", "email_log",
];
const names = Object.keys(dump.tables);
const ordered = [...ORDER.filter((t) => names.includes(t)),
                 ...names.filter((t) => !ORDER.includes(t))];

let total = 0;
for (const t of ordered) total += dump.tables[t].length;
console.log(`backup taken ${dump.takenAt}`);
console.log(`${total} rows across ${ordered.length} tables`);
for (const t of ordered) {
  if (dump.tables[t].length) console.log(String(dump.tables[t].length).padStart(7), t);
}

if (!process.argv.includes("--yes")) {
  console.log("\nDry run. Re-run with --yes to replace the current contents.");
  process.exit(0);
}

await sql.query(
  `TRUNCATE TABLE ${ordered.map((t) => `"${t}"`).join(", ")} RESTART IDENTITY CASCADE`);

let written = 0;
for (const t of ordered) {
  const rows = dump.tables[t];
  if (!rows.length) continue;
  const cols = Object.keys(rows[0]);
  const quoted = cols.map((c) => `"${c}"`).join(", ");
  for (const row of rows) {
    const params = cols.map((c) => row[c]);
    const holes = cols.map((_, i) => `$${i + 1}`).join(", ");
    await sql.query(`INSERT INTO "${t}" (${quoted}) VALUES (${holes})`, params);
    written++;
  }
  console.log(`restored ${rows.length} into ${t}`);
}
console.log(`\n${written} rows restored.`);
