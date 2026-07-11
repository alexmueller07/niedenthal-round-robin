-- Round Robin Web schema (Neon Postgres).
-- Dates/times are Madison wall-clock stored as text-ish types on purpose:
-- single-site study, no UTC conversion anywhere.

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

-- One live (invited/confirmed) assignment per participant per slot.
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

INSERT INTO settings (key, value) VALUES
  ('group_min', '6'),
  ('group_max', '8'),
  ('overrecruit', '2'),
  ('min_ras', '2'),
  ('seed', '20260711')
ON CONFLICT (key) DO NOTHING;
