-- Round Robin Web schema (Neon Postgres).
-- Dates/times are Madison wall-clock stored as text-ish types on purpose:
-- single-site study, no UTC conversion anywhere.
--
-- This file is idempotent: re-running it (via scripts/setup-db.mjs) only ever
-- adds missing tables/columns/settings, never drops data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Weekly recurring shift templates — the "employee shift" model. Each RA is
-- assigned to a fixed set of these for the whole semester (see ra_shifts).
-- Dated session slots are generated from active shifts across the semester.
CREATE TABLE IF NOT EXISTS weekly_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),  -- 0 = Sunday
  start_time TEXT NOT NULL,  -- 'HH:MM' 24h
  end_time TEXT NOT NULL,    -- 'HH:MM' 24h
  room_count INTEGER NOT NULL DEFAULT 3,
  preferred BOOLEAN NOT NULL DEFAULT FALSE,  -- surfaced first to participants
  active BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (weekday, start_time)
);

-- Fixed RA <-> shift assignment for the semester. Week-to-week swaps are
-- handled off-app (an RA emails Randy); the app models the standing roster.
CREATE TABLE IF NOT EXISTS ra_shifts (
  ra_id UUID NOT NULL REFERENCES ras(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES weekly_shifts(id) ON DELETE CASCADE,
  PRIMARY KEY (ra_id, shift_id)
);

CREATE TABLE IF NOT EXISTS slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  start_time TEXT NOT NULL,  -- 'HH:MM' 24h
  end_time TEXT NOT NULL,    -- 'HH:MM' 24h
  room_count INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'scheduled', 'completed', 'canceled')),
  follow_up_of UUID REFERENCES slots(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  UNIQUE (date, start_time)
);

CREATE TABLE IF NOT EXISTS ra_availability (
  ra_id UUID NOT NULL REFERENCES ras(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  PRIMARY KEY (ra_id, slot_id)
);

CREATE TABLE IF NOT EXISTS participant_availability (
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, slot_id)
);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'confirmed', 'attended', 'no_show', 'canceled')),
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'alternate')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS assignments_live_unique
  ON assignments (participant_id, slot_id)
  WHERE status IN ('invited', 'confirmed');

CREATE INDEX IF NOT EXISTS assignments_slot_idx ON assignments (slot_id);
CREATE INDEX IF NOT EXISTS assignments_participant_idx ON assignments (participant_id);

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  slot_id UUID REFERENCES slots(id) ON DELETE SET NULL,
  template TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Additive columns for tables that predate the shift model / NetID capture.
-- ADD COLUMN IF NOT EXISTS keeps this safe to re-run on a populated database.
ALTER TABLE participants ADD COLUMN IF NOT EXISTS netid TEXT;
ALTER TABLE participants ADD COLUMN IF NOT EXISTS declined_all BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS shift_id UUID REFERENCES weekly_shifts(id) ON DELETE SET NULL;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS preferred BOOLEAN NOT NULL DEFAULT FALSE;

-- Experimenter dashboard: the locked-in day-of room rotation and where the
-- session currently is, plus each participant's live status and help flag.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS rotation JSONB;
ALTER TABLE slots ADD COLUMN IF NOT EXISTS current_round INTEGER NOT NULL DEFAULT 0;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS live_status TEXT NOT NULL DEFAULT 'waiting';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS needs_help BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS slots_shift_idx ON slots (shift_id);

INSERT INTO settings (key, value) VALUES
  ('group_min', '6'),
  ('group_max', '8'),
  ('overrecruit', '2'),
  ('min_ras', '4'),
  ('seed', '20260711'),
  ('semester_start', '2026-09-02'),
  ('semester_end', '2026-12-11'),
  ('conversation_minutes', '10')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- Head RA + 4-RA coverage (Randy, 2026-07-22)
-- ===========================================================================

-- Head RA for a recurring shift (the semester standing), with at most one per
-- shift. A dated session can override it via slots.head_ra_id below.
ALTER TABLE ra_shifts ADD COLUMN IF NOT EXISTS is_head BOOLEAN NOT NULL DEFAULT FALSE;
CREATE UNIQUE INDEX IF NOT EXISTS ra_shifts_one_head
  ON ra_shifts (shift_id) WHERE is_head;

-- Per-session head override. Also the only way to set a head on a one-off slot,
-- which has no shift to inherit from.
ALTER TABLE slots ADD COLUMN IF NOT EXISTS head_ra_id UUID REFERENCES ras(id) ON DELETE SET NULL;

-- One-time bump of the coverage target from 3 to 4. Guarded by a marker row so
-- re-running the schema never clobbers a value Randy sets deliberately later.
UPDATE settings SET value = '4'
  WHERE key = 'min_ras'
    AND NOT EXISTS (SELECT 1 FROM settings WHERE key = 'min_ras_v2');

INSERT INTO settings (key, value) VALUES ('min_ras_v2', 'applied')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- Blackout dates — semester generation skips these (holidays, breaks, finals)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS blackout_dates (
  date DATE PRIMARY KEY,
  label TEXT NOT NULL DEFAULT ''
);

-- ===========================================================================
-- RA self-service availability
-- ===========================================================================

-- RAs sign in to /ra with a NetID that an admin pre-registers here, so the
-- availability page can't be claimed by someone outside the lab.
ALTER TABLE ras ADD COLUMN IF NOT EXISTS netid TEXT;
ALTER TABLE ras ADD COLUMN IF NOT EXISTS email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ras_netid_unique ON ras (netid) WHERE netid IS NOT NULL;

-- What an RA says they CAN staff. Deliberately separate from ra_shifts, which
-- stays the binding assignment an admin makes.
CREATE TABLE IF NOT EXISTS ra_shift_preferences (
  ra_id UUID NOT NULL REFERENCES ras(id) ON DELETE CASCADE,
  shift_id UUID NOT NULL REFERENCES weekly_shifts(id) ON DELETE CASCADE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (ra_id, shift_id)
);

-- Set when an RA submits (even if they submit an empty set), so the dashboard
-- can tell "said they're free nowhere" apart from "hasn't responded".
ALTER TABLE ras ADD COLUMN IF NOT EXISTS availability_submitted_at TIMESTAMPTZ;

-- ===========================================================================
-- Panopticon Control Center
-- ===========================================================================

-- A browser tab that has claimed a role for a session: a room camera, a
-- participant rating station, or the control center itself. Presence is a
-- heartbeat on last_seen.
CREATE TABLE IF NOT EXISTS room_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('camera', 'station', 'control')),
  room_index INTEGER,
  participant_id UUID REFERENCES participants(id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS room_devices_slot_idx ON room_devices (slot_id, kind);

-- One recorded conversation. participant_a/participant_b come straight from the
-- rotation at record time — that stamp is what routes the clip to the right
-- participants' rating stations later.
CREATE TABLE IF NOT EXISTS recordings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  round INTEGER NOT NULL,
  room_index INTEGER NOT NULL,
  participant_a UUID REFERENCES participants(id) ON DELETE SET NULL,
  participant_b UUID REFERENCES participants(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'video/webm',
  bytes BIGINT NOT NULL DEFAULT 0,
  duration_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'recording'
    CHECK (status IN ('recording', 'uploading', 'stored', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  UNIQUE (slot_id, round, room_index)
);

CREATE INDEX IF NOT EXISTS recordings_slot_idx ON recordings (slot_id);
CREATE INDEX IF NOT EXISTS recordings_a_idx ON recordings (participant_a);
CREATE INDEX IF NOT EXISTS recordings_b_idx ON recordings (participant_b);

-- WebRTC signaling mailbox. Subscribers long-poll for rows addressed to them
-- over SSE; rows are disposable and swept after an hour.
CREATE TABLE IF NOT EXISTS signals (
  id BIGSERIAL PRIMARY KEY,
  slot_id UUID NOT NULL REFERENCES slots(id) ON DELETE CASCADE,
  from_device UUID NOT NULL,
  to_device UUID NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS signals_inbox_idx ON signals (to_device, id);

-- Progress reported by the PPS app as a participant works through it.
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS pps_stage TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS pps_percent INTEGER;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS pps_updated_at TIMESTAMPTZ;
