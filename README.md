# Round Robin — Niedenthal Lab Scheduling

Calendar-scheduling web app for the Niedenthal Lab round-robin conversation
study (UW–Madison). RAs set a recurring **weekly shift schedule** and are
assigned to their standing shifts for the semester; the app generates dated
sessions from that schedule. Participants mark every time they can attend, and
the engine forms sessions of 6–8 from the overlap of participant availability
and shift coverage, over-recruits alternates as no-show insurance, and
automatically re-queues no-shows into their next compatible session.

Successor to Suhaas's `round-robin-scheduler` / `round-robin-orientation`
admin flow (free-text slots, manual per-slot participant lookup, no no-show
handling). Design doc: `../artifacts/2026-07-11-roundrobin-web-design.md`.

## How it works

**Participants** (`/`) sign in with name + email + UW NetID, then pick from the
posted session times — **preferred times shown first**, the rest collapsed, with
a subtle "filling up" nudge and an explicit "none of these times work for me"
escape so nobody leaves availability blank. They see their current session with
a one-tap confirm. Invitation emails carry a signed one-click confirm link.

**RAs** (`/admin`, shared lab password) — four tabs, each one job:

| Tab | What it does |
|---|---|
| Today | What's running right now with a direct route into the live console, what needs a decision, what's coming up |
| Schedule | Three steps: **paint** the weekly grid → staff it (4 RAs + a head RA) → publish the semester. Includes the days-off calendar, session generation, bulk removal, and the engine's fill proposal |
| People | Participants, the RA roster (incl. NetIDs and who hasn't submitted availability), and the full email log |
| Control Center | Live room cameras, recording control, capture coverage, participant progress |

Sub-pages: a session page (one-tap check-in / no-show, which auto-promotes a
confirmed alternate and auto-reschedules the no-show; roster CSV export incl.
NetID; follow-up creation) and the live session console (room rotation, rounds,
help flags).

**RAs submitting availability** (`/ra`): an RA signs in with a NetID an admin
pre-registered, then paints the hours they can work. `shiftsCoveredBy` turns
that into concrete shifts — a shift counts only when the paint spans all of it.
Submissions are availability, not assignment: Randy still decides who staffs
what, and the staffing grid just tints the cells an RA offered.

**Shift model** (`lib/schedule.ts`): weekly shifts (weekday + time + rooms) are
the source of truth for when the lab runs. `generateShiftSlots` expands the
active shifts into dated `slots` across the semester window, skipping blackout
dates; each generated slot's RA coverage is derived from the RAs assigned to its
shift. A session needs `min_ras` RAs to be fillable. It should also have a
designated **head RA**: with the `require_head_ra` setting on, a headless
session isn't fillable at all (what Randy asked for); with it off — the default,
so scheduling isn't blocked before heads are assigned — the session still fills
but is flagged on the board, in the staffing grid, and in the scheduler preview.
Toggle it under Schedule → Advanced. Repainting the schedule deactivates dropped
shifts rather than deleting them, so generated sessions and RA assignments
survive. Week-to-week swaps are handled off-app (an RA emails Randy).

**Control Center** (`/admin/control`) is the admin counterpart to the PPS app.
Each conversation room runs a kiosk page (`/room/[slotId]/[roomIndex]`) that
publishes its camera and records the conversation: seat the participants, hit
Arm once, walk out — a countdown starts the recording and it stops itself at the
conversation length. The control wall shows every room live, plus a matrix of
what's been captured per round so a missed recording is visible while it can
still be redone.

**Routing** (`lib/routing.ts`) is the core of it, and everything derives from
`slots.rotation` — nothing re-decides who is where. Each recording is stamped
with its dyad at capture time, which is what later answers "which videos does
this participant rate?". That's the PPS integration seam:
`GET /api/pps/recordings?email=…` returns a participant's own conversations in
round order with authenticated playback URLs, and `POST /api/pps/progress` lets
the PPS app report where someone is.

Signaling is SSE (`/api/control/signal/stream`) rather than WebSockets — no
extra dependency, no separate socket server, and it works under plain Node on
the UW server as well as on Vercel.

**Engine** (`lib/engine.ts`) is pure and seeded — same state + same seed =
same proposal (the seed is shown on every run). Invariants are unit-tested:
no double-booking, group min/max respected, follow-up slots restricted to the
parent session's attendees, no-shows re-enter the pool.

**Emails** send via Resend when `RESEND_API_KEY`/`EMAIL_FROM` are set;
otherwise every message is logged as `manual` with copy-ready text on the
Emails page. A daily Vercel cron sends day-before reminders.

**PPS app link**: participants are keyed by email in both systems; the
session-page CSV export (`email, full_name, role, status, …`) feeds the PPS
app's email-based round-robin sign-in.

## Development

```powershell
npm install
Copy-Item .env.example .env.local   # fill in values
node scripts/setup-db.mjs           # applies schema.sql (idempotent)
npm run dev                         # http://localhost:3000
```

Tests, lint, build:

```powershell
npx vitest run
npm run lint
npm run build
```

## Deployment

Vercel + Neon Postgres (Marketplace). Set the env vars from `.env.example` in
the Vercel project, run `node scripts/setup-db.mjs` once against the
production `DATABASE_URL`, and deploy. `vercel.json` schedules the reminder
cron at 15:00 UTC (9/10am Madison).

The schema migration is idempotent (`CREATE ... IF NOT EXISTS`, `ADD COLUMN IF
NOT EXISTS`) — re-running `setup-db.mjs` only adds what's missing, so applying
it to an existing pilot database is safe.

**UW "nickel" server:** DoIT confirmed Node.js on the account, so the app ships
as the standalone bundle (`output: "standalone"` → `.next/standalone/server.js`)
behind Apache. Step-by-step:
`../artifacts/2026-07-22-nickel-deploy-runbook.md`. Two Apache settings there
are load-bearing and not the default — proxy buffering must be off or WebRTC
signaling stalls, and the request body limit must allow recording chunks.

## Data note (IRB 2020-1657)

Scheduling data (name, email, availability, attendance) lives in Postgres.

**Conversation recordings are study data and are handled differently.** They are
written to `RECORDING_DIR` — the mounted UW Research Drive share — never to the
database, never to cloud storage, and never into this repo (`.gitignore` covers
`*.webm`). The directory must sit outside the web root: files are only ever
served through `/api/recordings/[id]/file`, which checks that the caller is an
RA, the participant who was actually in that conversation, or the PPS app with
its shared secret.

Randy's sign-off is required before the control center records a real session.
