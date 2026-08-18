// Throwaway diagnostic: what recording rows exist, and how old are they?
//
// Answers the only question that matters when a take comes back "not linked":
// is a row still sitting in_progress for this room, and how long has it been
// there? Read-only.

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

const sql = neon(process.env.DATABASE_URL);
const rows = await sql`
  SELECT id, slot_id, round, room_index, status, storage_key, bytes,
         started_at, ended_at,
         ROUND(EXTRACT(EPOCH FROM (now() - started_at)) / 60) AS age_minutes
    FROM recordings
   ORDER BY started_at DESC
   LIMIT 10`;

if (rows.length === 0) console.log("No recording rows at all.");
for (const r of rows) {
  console.log(
    `${r.status.padEnd(10)} round ${r.round} room ${r.room_index}  ` +
      `age ${String(r.age_minutes).padStart(4)} min  bytes ${r.bytes}\n` +
      `           slot ${r.slot_id}\n           key  ${r.storage_key}`
  );
}
