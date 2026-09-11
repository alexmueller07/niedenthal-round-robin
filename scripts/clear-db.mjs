// Empty every table, keeping the schema. For starting a test run from scratch.
//
// Refuses to run without --yes, and takes its own backup first regardless, to
// C:\lab-corpus\rr-backup — outside the repo, because the dump contains
// participant names, emails and NetIDs (IRB 2020-1657).
//
// Restore with: node scripts/restore-db.mjs <backup.json>
import { neon } from "@neondatabase/serverless";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set. npx vercel env pull .env.local");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
const host = new URL(process.env.DATABASE_URL).hostname;

const tables = (await sql`
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`)
  .map((r) => r.table_name);

let before = 0;
const counts = [];
for (const t of tables) {
  const n = (await sql.query(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
  counts.push([t, n]);
  before += n;
}

console.log(`database: ${host}`);
for (const [t, n] of counts) console.log(String(n).padStart(7), t);
console.log("-".repeat(30));
console.log(String(before).padStart(7), "rows total");

if (!process.argv.includes("--yes")) {
  console.log("\nDry run. Re-run with --yes to actually clear it.");
  process.exit(0);
}

const dir = "C:/lab-corpus/rr-backup";
mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dump = { takenAt: new Date().toISOString(), host, tables: {} };
for (const t of tables) dump.tables[t] = await sql.query(`SELECT * FROM "${t}"`);
const backup = dir + "/roundrobin-preclear-" + stamp + ".json";
writeFileSync(backup, JSON.stringify(dump, null, 1));
console.log(`\nbacked up to ${backup}`);

// One statement, so foreign keys between these tables cannot block it and the
// whole thing is atomic.
const list = tables.map((t) => `"${t}"`).join(", ");
await sql.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);

let after = 0;
for (const t of tables) {
  after += (await sql.query(`SELECT count(*)::int AS n FROM "${t}"`))[0].n;
}
console.log(`cleared: ${before} rows -> ${after}`);
if (after !== 0) {
  console.error("something is still in there; check the tables above");
  process.exit(1);
}
console.log(`${tables.length} tables empty, schema intact.`);
