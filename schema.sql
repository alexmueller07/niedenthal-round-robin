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

CREATE INDEX IF NOT EXISTS slots_shift_idx ON slots (shift_id);

INSERT INTO settings (key, value) VALUES
  ('group_min', '6'),
  ('group_max', '8'),
  ('overrecruit', '2'),
  ('min_ras', '2'),
  ('seed', '20260711'),
  ('semester_start', '2026-09-02'),
  ('semester_end', '2026-12-11')
ON CONFLICT (key) DO NOTHING;
