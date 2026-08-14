// Disposable end-to-end test fixture for the recording pipeline.
//
// Creates two clearly-fake participants and one session TODAY (one room, both
// participants confirmed), so the whole loop can be exercised on one machine:
// Lab Recorder opens a take against the session, files the video, and the PPS
// app finds it by the participant's email. Nothing here touches real data,
// and --cleanup removes exactly what this script made, recordings included.
//
// Usage (from the round-robin folder, with DATABASE_URL set or .env.local
// present):
//   node scripts/seed-pipeline-test.mjs            # create the fixture
//   node scripts/seed-pipeline-test.mjs --cleanup  # remove it again
//
// NOTE: this talks to whatever database DATABASE_URL points at — for the lab
// that is the live Neon instance behind the Vercel deployment. The fixture is
// namespaced (test emails, a marker in slots.notes) so it cannot collide with
// real participants, but still: run --cleanup when you are done.

import { neon } from "@neondatabase/serverless";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const MARKER = "PIPELINE TEST — safe to delete";
const EMAILS = ["pipeline-test-a@test.wisc.edu", "pipeline-test-b@test.wisc.edu"];
const NAMES = ["Pipeline Test A", "Pipeline Test B"];
const NETIDS = ["pipelinetesta", "pipelinetestb"];
// Late evening: real sessions never run then, so the UNIQUE(date,start_time)
// constraint cannot collide with a genuine slot.
const START = "23:30";
const END = "23:59";

// setup-db.mjs expects DATABASE_URL in the environment; this script also reads
// .env.local directly so it works with a plain `node scripts/...` invocation.
if (!process.env.DATABASE_URL) {
  const envPath = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
      }
    }
  }
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set and .env.local was not found.");
  process.exit(1);
}
const sql = neon(url);

const todayMadison = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Chicago",
}).format(new Date());

async function cleanup() {
  const slots = await sql`SELECT id FROM slots WHERE notes = ${MARKER};`;
  const slotIds = slots.map((s) => s.id);
  let recordings = 0;
  for (const id of slotIds) {
    const gone = await sql`DELETE FROM recordings WHERE slot_id = ${id} RETURNING id;`;
    recordings += gone.length;
    await sql`DELETE FROM signals WHERE slot_id = ${id};`;
    await sql`DELETE FROM room_devices WHERE slot_id = ${id};`;
    await sql`DELETE FROM slots WHERE id = ${id};`;
  }
  // ON DELETE CASCADE on assignments handles both directions.
  const people = await sql`
    DELETE FROM participants WHERE email = ANY(${EMAILS}) RETURNING id;`;
  console.log(
    `Removed ${slotIds.length} test session(s), ${recordings} recording row(s), ` +
      `${people.length} test participant(s).`
  );
  console.log(
    "The video files themselves live in your RECORDING_DIR / test drive folder — delete those by hand."
  );
}

async function seed() {
  // Reuse an existing fixture rather than erroring — running the script twice
  // should land you in the same place.
  const existing = await sql`
    SELECT id FROM slots WHERE notes = ${MARKER} AND date = ${todayMadison};`;
  let slotId = existing[0]?.id;
  if (!slotId) {
    const inserted = await sql`
      INSERT INTO slots (date, start_time, end_time, room_count, status, notes)
      VALUES (${todayMadison}, ${START}, ${END}, 1, 'scheduled', ${MARKER})
      RETURNING id;`;
    slotId = inserted[0].id;
  }

  const participantIds = [];
  for (let i = 0; i < EMAILS.length; i++) {
    const rows = await sql`
      INSERT INTO participants (email, full_name, netid)
      VALUES (${EMAILS[i]}, ${NAMES[i]}, ${NETIDS[i]})
      ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
      RETURNING id;`;
    participantIds.push(rows[0].id);
  }

  for (const pid of participantIds) {
    const already = await sql`
      SELECT id FROM assignments
      WHERE participant_id = ${pid} AND slot_id = ${slotId}
        AND status IN ('invited', 'confirmed', 'attended');`;
    if (already.length === 0) {
      await sql`
        INSERT INTO assignments (participant_id, slot_id, status, role)
        VALUES (${pid}, ${slotId}, 'confirmed', 'member');`;
    } else {
      await sql`UPDATE assignments SET status = 'confirmed' WHERE id = ${already[0].id};`;
    }
  }

  console.log("Test fixture ready.");
  console.log(`  Session:      today (${todayMadison}) ${START}–${END}, 1 room, id ${slotId}`);
  console.log(`  Participants: ${EMAILS.join("  +  ")}  (both confirmed)`);
  console.log("");
  console.log("Next steps:");
  console.log(`  1. /admin → Sessions → today's ${START} session → Run console →`);
  console.log('     "Generate room rotation" (round 1 becomes active).');
  console.log("  2. Lab Recorder: pick this session + room 1, record, stop.");
  console.log(`  3. Watch /admin/control/${slotId}`);
  console.log(`  4. PPS app: sign in as ${EMAILS[0]} and run the session.`);
  console.log("");
  console.log("When finished:  node scripts/seed-pipeline-test.mjs --cleanup");
}

if (process.argv.includes("--cleanup")) {
  await cleanup();
} else {
  await seed();
}
