// Data layer: typed, parameterized queries over the Neon serverless driver.
// Every function returns domain types from lib/types.ts — SQL stays here.

import { neon } from "@neondatabase/serverless";
import type {
  Assignment,
  AssignmentRole,
  AssignmentStatus,
  EmailLogEntry,
  EmailStatus,
  EmailTemplate,
  Participant,
  ParticipantStatus,
  Ra,
  Settings,
  Slot,
  SlotStatus,
} from "./types";
import { DEFAULT_SETTINGS } from "./types";

function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

type Row = Record<string, unknown>;

const asString = (v: unknown): string => String(v);
const asTimestamp = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v);
/** Neon returns DATE columns as 'YYYY-MM-DD' strings or Date objects. */
const asDate = (v: unknown): string => {
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).slice(0, 10);
};

function toParticipant(r: Row): Participant {
  return {
    id: asString(r.id),
    email: asString(r.email),
    fullName: asString(r.full_name),
    status: asString(r.status) as ParticipantStatus,
    createdAt: asTimestamp(r.created_at),
  };
}

function toRa(r: Row): Ra {
  return { id: asString(r.id), name: asString(r.name), active: Boolean(r.active) };
}

function toSlot(r: Row): Slot {
  return {
    id: asString(r.id),
    date: asDate(r.date),
    startTime: asString(r.start_time),
    endTime: asString(r.end_time),
    roomCount: Number(r.room_count),
    status: asString(r.status) as SlotStatus,
    followUpOf: r.follow_up_of === null ? null : asString(r.follow_up_of),
    notes: asString(r.notes ?? ""),
  };
}

function toAssignment(r: Row): Assignment {
  return {
    id: asString(r.id),
    participantId: asString(r.participant_id),
    slotId: asString(r.slot_id),
    status: asString(r.status) as AssignmentStatus,
    role: asString(r.role) as AssignmentRole,
    assignedAt: asTimestamp(r.assigned_at),
    decidedAt: r.decided_at === null ? null : asTimestamp(r.decided_at),
  };
}

function toEmailLogEntry(r: Row): EmailLogEntry {
  return {
    id: asString(r.id),
    participantId: r.participant_id === null ? null : asString(r.participant_id),
    slotId: r.slot_id === null ? null : asString(r.slot_id),
    template: asString(r.template) as EmailTemplate,
    toEmail: asString(r.to_email),
    subject: asString(r.subject),
    body: asString(r.body),
    status: asString(r.status) as EmailStatus,
    createdAt: asTimestamp(r.created_at),
  };
}

// ---------------------------------------------------------------- participants

export async function upsertParticipant(
  email: string,
  fullName: string
): Promise<Participant> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO participants (email, full_name)
    VALUES (${email.trim().toLowerCase()}, ${fullName.trim()})
    ON CONFLICT (email) DO UPDATE
      SET full_name = CASE
        WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name
        ELSE participants.full_name
      END
    RETURNING *;`;
  return toParticipant(rows[0]);
}

export async function getParticipantByEmail(email: string): Promise<Participant | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM participants WHERE email = ${email.trim().toLowerCase()};`;
  return rows.length > 0 ? toParticipant(rows[0]) : null;
}

export async function getParticipantById(id: string): Promise<Participant | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM participants WHERE id = ${id};`;
  return rows.length > 0 ? toParticipant(rows[0]) : null;
}

export async function listParticipants(): Promise<Participant[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM participants ORDER BY created_at;`;
  return rows.map(toParticipant);
}

export async function setParticipantStatus(
  id: string,
  status: ParticipantStatus
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE participants SET status = ${status} WHERE id = ${id};`;
}

// ------------------------------------------------------------------------ RAs

export async function listRas(): Promise<Ra[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM ras ORDER BY name;`;
  return rows.map(toRa);
}

export async function createRa(name: string): Promise<Ra> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO ras (name) VALUES (${name.trim()})
    ON CONFLICT (name) DO UPDATE SET active = TRUE
    RETURNING *;`;
  return toRa(rows[0]);
}

export async function setRaActive(id: string, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE ras SET active = ${active} WHERE id = ${id};`;
}

// ---------------------------------------------------------------------- slots

export async function createSlot(input: {
  date: string;
  startTime: string;
  endTime: string;
  roomCount?: number;
  followUpOf?: string | null;
  notes?: string;
}): Promise<Slot> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO slots (date, start_time, end_time, room_count, follow_up_of, notes)
    VALUES (${input.date}, ${input.startTime}, ${input.endTime},
            ${input.roomCount ?? 3}, ${input.followUpOf ?? null}, ${input.notes ?? ""})
    ON CONFLICT (date, start_time) DO UPDATE SET end_time = EXCLUDED.end_time
    RETURNING *;`;
  return toSlot(rows[0]);
}

export async function listSlots(): Promise<Slot[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM slots ORDER BY date, start_time;`;
  return rows.map(toSlot);
}

export async function getSlot(id: string): Promise<Slot | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM slots WHERE id = ${id};`;
  return rows.length > 0 ? toSlot(rows[0]) : null;
}

export async function setSlotStatus(id: string, status: SlotStatus): Promise<void> {
  const sql = getSql();
  await sql`UPDATE slots SET status = ${status} WHERE id = ${id};`;
}

// --------------------------------------------------------------- availability

export async function listRaAvailability(): Promise<Array<{ raId: string; slotId: string }>> {
  const sql = getSql();
  const rows = await sql`SELECT ra_id, slot_id FROM ra_availability;`;
  return rows.map((r) => ({ raId: asString(r.ra_id), slotId: asString(r.slot_id) }));
}

export async function setRaAvailability(
  raId: string,
  slotId: string,
  available: boolean
): Promise<void> {
  const sql = getSql();
  if (available) {
    await sql`
      INSERT INTO ra_availability (ra_id, slot_id) VALUES (${raId}, ${slotId})
      ON CONFLICT DO NOTHING;`;
  } else {
    await sql`
      DELETE FROM ra_availability WHERE ra_id = ${raId} AND slot_id = ${slotId};`;
  }
}

export async function listParticipantAvailability(): Promise<
  Array<{ participantId: string; slotId: string }>
> {
  const sql = getSql();
  const rows = await sql`SELECT participant_id, slot_id FROM participant_availability;`;
  return rows.map((r) => ({
    participantId: asString(r.participant_id),
    slotId: asString(r.slot_id),
  }));
}

export async function getAvailabilityForParticipant(
  participantId: string
): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT slot_id FROM participant_availability
    WHERE participant_id = ${participantId};`;
  return rows.map((r) => asString(r.slot_id));
}

/** Replaces the participant's availability with exactly `slotIds`. */
export async function replaceParticipantAvailability(
  participantId: string,
  slotIds: string[]
): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM participant_availability WHERE participant_id = ${participantId};`;
  for (const slotId of slotIds) {
    await sql`
      INSERT INTO participant_availability (participant_id, slot_id)
      VALUES (${participantId}, ${slotId})
      ON CONFLICT DO NOTHING;`;
  }
}

// ---------------------------------------------------------------- assignments

export async function listAssignments(): Promise<Assignment[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM assignments ORDER BY assigned_at;`;
  return rows.map(toAssignment);
}

export async function listAssignmentsForSlot(slotId: string): Promise<Assignment[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM assignments WHERE slot_id = ${slotId} ORDER BY assigned_at;`;
  return rows.map(toAssignment);
}

export async function listAssignmentsForParticipant(
  participantId: string
): Promise<Assignment[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM assignments WHERE participant_id = ${participantId}
    ORDER BY assigned_at;`;
  return rows.map(toAssignment);
}

export async function createAssignment(
  participantId: string,
  slotId: string,
  role: AssignmentRole
): Promise<Assignment> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO assignments (participant_id, slot_id, role)
    VALUES (${participantId}, ${slotId}, ${role})
    RETURNING *;`;
  return toAssignment(rows[0]);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM assignments WHERE id = ${id};`;
  return rows.length > 0 ? toAssignment(rows[0]) : null;
}

export async function setAssignmentStatus(
  id: string,
  status: AssignmentStatus
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE assignments SET status = ${status}, decided_at = now() WHERE id = ${id};`;
}

export async function setAssignmentRole(id: string, role: AssignmentRole): Promise<void> {
  const sql = getSql();
  await sql`UPDATE assignments SET role = ${role} WHERE id = ${id};`;
}

// ------------------------------------------------------------------ email log

export async function logEmail(entry: {
  participantId: string | null;
  slotId: string | null;
  template: EmailTemplate;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO email_log (participant_id, slot_id, template, to_email, subject, body, status)
    VALUES (${entry.participantId}, ${entry.slotId}, ${entry.template},
            ${entry.toEmail}, ${entry.subject}, ${entry.body}, ${entry.status});`;
}

export async function listEmailLog(limit = 200): Promise<EmailLogEntry[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM email_log ORDER BY created_at DESC LIMIT ${limit};`;
  return rows.map(toEmailLogEntry);
}

// ------------------------------------------------------------------- settings

export async function getSettings(): Promise<Settings> {
  const sql = getSql();
  const rows = await sql`SELECT key, value FROM settings;`;
  const map = new Map(rows.map((r) => [asString(r.key), asString(r.value)]));
  const num = (key: string, fallback: number): number => {
    const raw = map.get(key);
    const parsed = raw === undefined ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    groupMin: num("group_min", DEFAULT_SETTINGS.groupMin),
    groupMax: num("group_max", DEFAULT_SETTINGS.groupMax),
    overrecruit: num("overrecruit", DEFAULT_SETTINGS.overrecruit),
    minRas: num("min_ras", DEFAULT_SETTINGS.minRas),
    seed: num("seed", DEFAULT_SETTINGS.seed),
  };
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`;
}
