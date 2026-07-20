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

**RAs** (`/admin`, shared lab password):

| Page | What it does |
|---|---|
| Board | Fill meters per upcoming session, "needs attention" alerts |
| Shifts & RAs | Define the recurring weekly schedule, assign each RA to their standing shifts for the semester, then generate the semester's dated sessions; one-off slots (pilots / follow-ups) still supported. Shifts need `min_ras` RAs before the engine touches their sessions |
| Scheduler | Preview the engine's proposal, then approve — approval creates assignments and sends invitations |
| Session page | One-tap check-in / no-show (auto-promotes a confirmed alternate and auto-reschedules the no-show), roster CSV export (incl. NetID), follow-up slot creation |
| Participants | Status, availability (incl. "no times work"), NetID, history, withdraw/reactivate |
| Emails | Full log; manual/failed sends get copy-ready text |

**Shift model** (`lib/schedule.ts`): weekly shifts (weekday + time + rooms) are
the source of truth for when the lab runs. `generateShiftSlots` expands the
active shifts into dated `slots` across the semester window; each generated
slot's RA coverage is derived from the RAs assigned to its shift. Week-to-week
swaps are handled off-app (an RA emails Randy).

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

**Self-hosting (e.g. UW psych server):** the build emits a standalone bundle
(`output: "standalone"` → `.next/standalone/server.js`) that runs under any
Node 20.9+ runtime with `node server.js`. See
`../artifacts/2026-07-20-wisc-server-migration.md` for the UW-server path and
what still needs confirming with DoIT.

## Data note (IRB 2020-1657)

This app stores scheduling contact info only (name, email, availability,
attendance) — never study data. Confirm the cloud-DB placement with Randy;
same exposure as the previous Google Cloud SQL setup.
