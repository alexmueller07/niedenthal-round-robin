// Data layer: typed, parameterized queries over the Neon serverless driver.
// Every function returns domain types from lib/types.ts — SQL stays here.

import { neon } from "@neondatabase/serverless";
import type {
  Assignment,
  AssignmentRole,
  AssignmentStatus,
  BlackoutDate,
  DeviceKind,
  EmailLogEntry,
  EmailStatus,
  EmailTemplate,
  LiveStatus,
  Participant,
  ParticipantStatus,
  Ra,
  Recording,
  RecordingStatus,
  RoomDevice,
  Rotation,
  Settings,
  Signal,
  Slot,
  SlotStatus,
  Weekday,
  WeeklyShift,
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
    netid: r.netid == null || r.netid === "" ? null : asString(r.netid),
    status: asString(r.status) as ParticipantStatus,
    declinedAll: Boolean(r.declined_all),
    createdAt: asTimestamp(r.created_at),
  };
}

function toRa(r: Row): Ra {
  return {
    id: asString(r.id),
    name: asString(r.name),
    active: Boolean(r.active),
    netid: r.netid == null || r.netid === "" ? null : asString(r.netid),
    email: r.email == null || r.email === "" ? null : asString(r.email),
    availabilitySubmittedAt:
      r.availability_submitted_at == null ? null : asTimestamp(r.availability_submitted_at),
  };
}

function toWeeklyShift(r: Row): WeeklyShift {
  return {
    id: asString(r.id),
    weekday: Number(r.weekday) as Weekday,
    startTime: asString(r.start_time),
    endTime: asString(r.end_time),
    roomCount: Number(r.room_count),
    preferred: Boolean(r.preferred),
    active: Boolean(r.active),
  };
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
    shiftId: r.shift_id == null ? null : asString(r.shift_id),
    preferred: Boolean(r.preferred),
    rotation: (r.rotation ?? null) as Slot["rotation"],
    currentRound: r.current_round == null ? 0 : Number(r.current_round),
    headRaId: r.head_ra_id == null ? null : asString(r.head_ra_id),
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
    liveStatus: (asString(r.live_status ?? "waiting")) as LiveStatus,
    needsHelp: Boolean(r.needs_help),
    ppsStage: r.pps_stage == null ? null : asString(r.pps_stage),
    ppsPercent: r.pps_percent == null ? null : Number(r.pps_percent),
    ppsUpdatedAt: r.pps_updated_at == null ? null : asTimestamp(r.pps_updated_at),
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
  fullName: string,
  netid: string | null = null
): Promise<Participant> {
  const sql = getSql();
  const cleanNetid = netid ? netid.trim().toLowerCase() : null;
  const rows = await sql`
    INSERT INTO participants (email, full_name, netid)
    VALUES (${email.trim().toLowerCase()}, ${fullName.trim()}, ${cleanNetid})
    ON CONFLICT (email) DO UPDATE
      SET full_name = CASE
        WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name
        ELSE participants.full_name
      END,
      netid = COALESCE(NULLIF(EXCLUDED.netid, ''), participants.netid)
    RETURNING *;`;
  return toParticipant(rows[0]);
}

export async function setParticipantDeclinedAll(
  id: string,
  declined: boolean
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE participants SET declined_all = ${declined} WHERE id = ${id};`;
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

export async function createRa(
  name: string,
  netid: string | null = null,
  email: string | null = null
): Promise<Ra> {
  const sql = getSql();
  const cleanNetid = netid ? netid.trim().toLowerCase() : null;
  const cleanEmail = email ? email.trim().toLowerCase() : null;
  const rows = await sql`
    INSERT INTO ras (name, netid, email) VALUES (${name.trim()}, ${cleanNetid}, ${cleanEmail})
    ON CONFLICT (name) DO UPDATE
      SET active = TRUE,
          netid = COALESCE(EXCLUDED.netid, ras.netid),
          email = COALESCE(EXCLUDED.email, ras.email)
    RETURNING *;`;
  return toRa(rows[0]);
}

export async function setRaActive(id: string, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE ras SET active = ${active} WHERE id = ${id};`;
}

/** Sets the NetID an RA signs in to `/ra` with (and their contact email). */
export async function setRaIdentity(
  id: string,
  netid: string | null,
  email: string | null
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE ras
    SET netid = ${netid ? netid.trim().toLowerCase() : null},
        email = ${email ? email.trim().toLowerCase() : null}
    WHERE id = ${id};`;
}

export async function getRaByNetid(netid: string): Promise<Ra | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM ras WHERE netid = ${netid.trim().toLowerCase()} AND active;`;
  return rows.length > 0 ? toRa(rows[0]) : null;
}

export async function getRaById(id: string): Promise<Ra | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM ras WHERE id = ${id};`;
  return rows.length > 0 ? toRa(rows[0]) : null;
}

// -------------------------------------------------------------- weekly shifts

export async function listWeeklyShifts(): Promise<WeeklyShift[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM weekly_shifts ORDER BY weekday, start_time;`;
  return rows.map(toWeeklyShift);
}

export async function createWeeklyShift(input: {
  weekday: Weekday;
  startTime: string;
  endTime: string;
  roomCount?: number;
  preferred?: boolean;
}): Promise<WeeklyShift> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO weekly_shifts (weekday, start_time, end_time, room_count, preferred)
    VALUES (${input.weekday}, ${input.startTime}, ${input.endTime},
            ${input.roomCount ?? 3}, ${input.preferred ?? false})
    ON CONFLICT (weekday, start_time) DO UPDATE
      SET end_time = EXCLUDED.end_time,
          room_count = EXCLUDED.room_count,
          preferred = EXCLUDED.preferred,
          active = TRUE
    RETURNING *;`;
  return toWeeklyShift(rows[0]);
}

export async function setWeeklyShiftActive(id: string, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE weekly_shifts SET active = ${active} WHERE id = ${id};`;
}

export async function setWeeklyShiftPreferred(
  id: string,
  preferred: boolean
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE weekly_shifts SET preferred = ${preferred} WHERE id = ${id};`;
}

export async function deleteWeeklyShift(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM weekly_shifts WHERE id = ${id};`;
}

export interface RaShift {
  raId: string;
  shiftId: string;
  isHead: boolean;
}

export async function listRaShifts(): Promise<RaShift[]> {
  const sql = getSql();
  const rows = await sql`SELECT ra_id, shift_id, is_head FROM ra_shifts;`;
  return rows.map((r) => ({
    raId: asString(r.ra_id),
    shiftId: asString(r.shift_id),
    isHead: Boolean(r.is_head),
  }));
}

export async function setRaShift(
  raId: string,
  shiftId: string,
  assigned: boolean
): Promise<void> {
  const sql = getSql();
  if (assigned) {
    await sql`
      INSERT INTO ra_shifts (ra_id, shift_id) VALUES (${raId}, ${shiftId})
      ON CONFLICT DO NOTHING;`;
  } else {
    await sql`DELETE FROM ra_shifts WHERE ra_id = ${raId} AND shift_id = ${shiftId};`;
  }
}

/**
 * Makes one RA the head of a shift. A partial unique index allows only one head
 * per shift, so the previous head is demoted first. Assigns the RA to the shift
 * if they weren't on it already — you can't be head of a shift you don't staff.
 */
export async function setShiftHead(raId: string, shiftId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE ra_shifts SET is_head = FALSE WHERE shift_id = ${shiftId};`;
  await sql`
    INSERT INTO ra_shifts (ra_id, shift_id, is_head) VALUES (${raId}, ${shiftId}, TRUE)
    ON CONFLICT (ra_id, shift_id) DO UPDATE SET is_head = TRUE;`;
}

export async function clearShiftHead(shiftId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE ra_shifts SET is_head = FALSE WHERE shift_id = ${shiftId};`;
}

/** Per-session head override (also the only way to set one on a one-off slot). */
export async function setSlotHeadRa(slotId: string, raId: string | null): Promise<void> {
  const sql = getSql();
  await sql`UPDATE slots SET head_ra_id = ${raId} WHERE id = ${slotId};`;
}

// ------------------------------------------------- RA availability (self-serve)

export async function listRaShiftPreferences(): Promise<
  Array<{ raId: string; shiftId: string }>
> {
  const sql = getSql();
  const rows = await sql`SELECT ra_id, shift_id FROM ra_shift_preferences;`;
  return rows.map((r) => ({ raId: asString(r.ra_id), shiftId: asString(r.shift_id) }));
}

export async function getRaShiftPreferences(raId: string): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT shift_id FROM ra_shift_preferences WHERE ra_id = ${raId};`;
  return rows.map((r) => asString(r.shift_id));
}

/**
 * Replaces an RA's submitted availability with exactly `shiftIds`, and stamps
 * the submission time so "hasn't responded" stays distinct from "free nowhere".
 */
export async function replaceRaShiftPreferences(
  raId: string,
  shiftIds: readonly string[]
): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM ra_shift_preferences WHERE ra_id = ${raId};`;
  for (const shiftId of shiftIds) {
    await sql`
      INSERT INTO ra_shift_preferences (ra_id, shift_id) VALUES (${raId}, ${shiftId})
      ON CONFLICT DO NOTHING;`;
  }
  await sql`UPDATE ras SET availability_submitted_at = now() WHERE id = ${raId};`;
}

// ------------------------------------------------------------- blackout dates

export async function listBlackoutDates(): Promise<BlackoutDate[]> {
  const sql = getSql();
  const rows = await sql`SELECT date, label FROM blackout_dates ORDER BY date;`;
  return rows.map((r) => ({ date: asDate(r.date), label: asString(r.label ?? "") }));
}

export async function addBlackoutDate(date: string, label = ""): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO blackout_dates (date, label) VALUES (${date}, ${label})
    ON CONFLICT (date) DO UPDATE SET label = EXCLUDED.label;`;
}

export async function removeBlackoutDate(date: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM blackout_dates WHERE date = ${date};`;
}

// ---------------------------------------------------------------------- slots

export async function createSlot(input: {
  date: string;
  startTime: string;
  endTime: string;
  roomCount?: number;
  followUpOf?: string | null;
  shiftId?: string | null;
  preferred?: boolean;
  notes?: string;
}): Promise<Slot> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO slots (date, start_time, end_time, room_count, follow_up_of, shift_id, preferred, notes)
    VALUES (${input.date}, ${input.startTime}, ${input.endTime},
            ${input.roomCount ?? 3}, ${input.followUpOf ?? null},
            ${input.shiftId ?? null}, ${input.preferred ?? false}, ${input.notes ?? ""})
    ON CONFLICT (date, start_time) DO UPDATE
      SET end_time = EXCLUDED.end_time,
          shift_id = COALESCE(slots.shift_id, EXCLUDED.shift_id),
          preferred = slots.preferred OR EXCLUDED.preferred
    RETURNING *;`;
  return toSlot(rows[0]);
}

/** Bulk slot insert for semester generation. Returns how many rows were new. */
export async function createSlotsBulk(
  slots: ReadonlyArray<{
    date: string;
    startTime: string;
    endTime: string;
    roomCount: number;
    shiftId: string;
    preferred: boolean;
  }>
): Promise<number> {
  const sql = getSql();
  let created = 0;
  for (const s of slots) {
    const rows = await sql`
      INSERT INTO slots (date, start_time, end_time, room_count, shift_id, preferred)
      VALUES (${s.date}, ${s.startTime}, ${s.endTime}, ${s.roomCount}, ${s.shiftId}, ${s.preferred})
      ON CONFLICT (date, start_time) DO NOTHING
      RETURNING id;`;
    if (rows.length > 0) created += 1;
  }
  return created;
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

/**
 * Slot ids from `candidates` that currently have a live (invited/confirmed) or
 * already-attended assignment. Those must never be hard-deleted — someone has
 * been told to show up, so they go through cancelSlot (which emails them).
 */
export async function slotIdsWithParticipants(
  candidates: readonly string[]
): Promise<Set<string>> {
  if (candidates.length === 0) return new Set();
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT slot_id FROM assignments
    WHERE slot_id = ANY(${candidates as string[]})
      AND status IN ('invited', 'confirmed', 'attended');`;
  return new Set(rows.map((r) => asString(r.slot_id)));
}

/**
 * Hard-deletes slots. Callers MUST filter out anything in
 * slotIdsWithParticipants first — this does not check.
 */
export async function deleteSlots(ids: readonly string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const sql = getSql();
  const rows = await sql`
    DELETE FROM slots WHERE id = ANY(${ids as string[]}) RETURNING id;`;
  return rows.length;
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

/** Live member seats taken per slot — drives the portal's "filling up" nudge. */
export async function getLiveMemberCountsBySlot(): Promise<Record<string, number>> {
  const sql = getSql();
  const rows = await sql`
    SELECT slot_id, COUNT(*)::int AS n FROM assignments
    WHERE status IN ('invited', 'confirmed') AND role = 'member'
    GROUP BY slot_id;`;
  const out: Record<string, number> = {};
  for (const r of rows) out[asString(r.slot_id)] = Number(r.n);
  return out;
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

// ---------------------------------------------------- experimenter console

export async function setSlotRotation(
  slotId: string,
  rotation: Rotation,
  currentRound: number
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE slots SET rotation = ${JSON.stringify(rotation)}, current_round = ${currentRound}
    WHERE id = ${slotId};`;
}

export async function setSlotCurrentRound(slotId: string, round: number): Promise<void> {
  const sql = getSql();
  await sql`UPDATE slots SET current_round = ${round} WHERE id = ${slotId};`;
}

export async function setAssignmentLiveStatus(
  id: string,
  status: LiveStatus
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE assignments SET live_status = ${status} WHERE id = ${id};`;
}

export async function setAssignmentNeedsHelp(id: string, needsHelp: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE assignments SET needs_help = ${needsHelp} WHERE id = ${id};`;
}

/** Participant-facing: raise a help flag on the participant's live assignment. */
export async function requestHelpForParticipant(
  participantId: string,
  slotId: string
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE assignments SET needs_help = TRUE
    WHERE participant_id = ${participantId} AND slot_id = ${slotId}
      AND status IN ('invited', 'confirmed', 'attended');`;
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
  const date = (key: string, fallback: string): string => {
    const raw = map.get(key);
    return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : fallback;
  };
  return {
    groupMin: num("group_min", DEFAULT_SETTINGS.groupMin),
    groupMax: num("group_max", DEFAULT_SETTINGS.groupMax),
    overrecruit: num("overrecruit", DEFAULT_SETTINGS.overrecruit),
    minRas: num("min_ras", DEFAULT_SETTINGS.minRas),
    seed: num("seed", DEFAULT_SETTINGS.seed),
    semesterStart: date("semester_start", DEFAULT_SETTINGS.semesterStart),
    semesterEnd: date("semester_end", DEFAULT_SETTINGS.semesterEnd),
    conversationMinutes: num(
      "conversation_minutes",
      DEFAULT_SETTINGS.conversationMinutes
    ),
  };
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;`;
}

// ------------------------------------------------- Panopticon Control Center

function toRoomDevice(r: Row): RoomDevice {
  return {
    id: asString(r.id),
    slotId: asString(r.slot_id),
    kind: asString(r.kind) as DeviceKind,
    roomIndex: r.room_index == null ? null : Number(r.room_index),
    participantId: r.participant_id == null ? null : asString(r.participant_id),
    label: asString(r.label ?? ""),
    lastSeen: asTimestamp(r.last_seen),
    createdAt: asTimestamp(r.created_at),
  };
}

function toRecording(r: Row): Recording {
  return {
    id: asString(r.id),
    slotId: asString(r.slot_id),
    round: Number(r.round),
    roomIndex: Number(r.room_index),
    participantA: r.participant_a == null ? null : asString(r.participant_a),
    participantB: r.participant_b == null ? null : asString(r.participant_b),
    storageKey: asString(r.storage_key),
    mimeType: asString(r.mime_type ?? "video/webm"),
    bytes: Number(r.bytes ?? 0),
    durationMs: r.duration_ms == null ? null : Number(r.duration_ms),
    status: asString(r.status) as RecordingStatus,
    startedAt: asTimestamp(r.started_at),
    endedAt: r.ended_at == null ? null : asTimestamp(r.ended_at),
  };
}

/** Registers (or re-registers) a browser tab as a device for a session. */
export async function registerDevice(input: {
  slotId: string;
  kind: DeviceKind;
  roomIndex?: number | null;
  participantId?: string | null;
  label?: string;
}): Promise<RoomDevice> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO room_devices (slot_id, kind, room_index, participant_id, label)
    VALUES (${input.slotId}, ${input.kind}, ${input.roomIndex ?? null},
            ${input.participantId ?? null}, ${input.label ?? ""})
    RETURNING *;`;
  return toRoomDevice(rows[0]);
}

export async function heartbeatDevice(deviceId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE room_devices SET last_seen = now() WHERE id = ${deviceId};`;
}

export async function removeDevice(deviceId: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM room_devices WHERE id = ${deviceId};`;
}

/**
 * Devices seen within `staleSeconds`. Anything older is treated as gone — a
 * closed browser tab never gets to say goodbye reliably.
 */
export async function listLiveDevices(
  slotId: string,
  staleSeconds = 30
): Promise<RoomDevice[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM room_devices
    WHERE slot_id = ${slotId}
      AND last_seen > now() - make_interval(secs => ${staleSeconds})
    ORDER BY kind, room_index;`;
  return rows.map(toRoomDevice);
}

/** Drops devices that stopped heartbeating a while ago. */
export async function sweepStaleDevices(staleSeconds = 300): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM room_devices
    WHERE last_seen < now() - make_interval(secs => ${staleSeconds});`;
}

// -------------------------------------------------------------- signaling

export async function pushSignal(input: {
  slotId: string;
  fromDevice: string;
  toDevice: string;
  payload: unknown;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO signals (slot_id, from_device, to_device, payload)
    VALUES (${input.slotId}, ${input.fromDevice}, ${input.toDevice},
            ${JSON.stringify(input.payload)});`;
}

/** Inbox poll for the SSE stream: everything addressed to me after `afterId`. */
export async function pullSignals(
  toDevice: string,
  afterId: number,
  limit = 50
): Promise<Signal[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM signals
    WHERE to_device = ${toDevice} AND id > ${afterId}
    ORDER BY id LIMIT ${limit};`;
  return rows.map((r) => ({
    id: Number(r.id),
    slotId: asString(r.slot_id),
    fromDevice: asString(r.from_device),
    toDevice: asString(r.to_device),
    payload: r.payload,
    createdAt: asTimestamp(r.created_at),
  }));
}

export async function sweepOldSignals(olderThanSeconds = 3600): Promise<void> {
  const sql = getSql();
  await sql`
    DELETE FROM signals
    WHERE created_at < now() - make_interval(secs => ${olderThanSeconds});`;
}

// -------------------------------------------------------------- recordings

/**
 * Opens (or reopens) the recording for one room in one round. The dyad is
 * stamped here from the rotation — that stamp is the routing key that later
 * tells the PPS app which clips belong to which participant.
 */
export async function openRecording(input: {
  slotId: string;
  round: number;
  roomIndex: number;
  participantA: string | null;
  participantB: string | null;
  storageKey: string;
  mimeType: string;
}): Promise<Recording> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO recordings
      (slot_id, round, room_index, participant_a, participant_b, storage_key, mime_type, status)
    VALUES (${input.slotId}, ${input.round}, ${input.roomIndex}, ${input.participantA},
            ${input.participantB}, ${input.storageKey}, ${input.mimeType}, 'recording')
    ON CONFLICT (slot_id, round, room_index) DO UPDATE
      SET participant_a = EXCLUDED.participant_a,
          participant_b = EXCLUDED.participant_b,
          storage_key = EXCLUDED.storage_key,
          mime_type = EXCLUDED.mime_type,
          status = 'recording',
          bytes = 0,
          duration_ms = NULL,
          started_at = now(),
          ended_at = NULL
    RETURNING *;`;
  return toRecording(rows[0]);
}

export async function getRecording(id: string): Promise<Recording | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM recordings WHERE id = ${id};`;
  return rows.length > 0 ? toRecording(rows[0]) : null;
}

export async function addRecordingBytes(id: string, bytes: number): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE recordings SET bytes = bytes + ${bytes}, status = 'uploading'
    WHERE id = ${id} AND status IN ('recording', 'uploading');`;
}

export async function closeRecording(
  id: string,
  status: RecordingStatus,
  durationMs: number | null
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE recordings
    SET status = ${status}, duration_ms = ${durationMs}, ended_at = now()
    WHERE id = ${id};`;
}

export async function listRecordingsForSlot(slotId: string): Promise<Recording[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM recordings WHERE slot_id = ${slotId}
    ORDER BY round, room_index;`;
  return rows.map(toRecording);
}

/**
 * Every stored clip a participant appears in, in round order. This is the
 * routing endpoint the PPS app consumes to load someone's own conversations.
 */
export async function listRecordingsForParticipant(
  participantId: string
): Promise<Recording[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM recordings
    WHERE status = 'stored'
      AND (participant_a = ${participantId} OR participant_b = ${participantId})
    ORDER BY slot_id, round;`;
  return rows.map(toRecording);
}

// ------------------------------------------------------------ PPS progress

export async function setPpsProgress(
  assignmentId: string,
  stage: string,
  percent: number | null
): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE assignments
    SET pps_stage = ${stage}, pps_percent = ${percent}, pps_updated_at = now()
    WHERE id = ${assignmentId};`;
}

/** Resolves a PPS-app report (keyed by participant email) to a live assignment. */
export async function findLiveAssignmentByEmail(
  email: string
): Promise<{ assignmentId: string; slotId: string } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT a.id, a.slot_id FROM assignments a
    JOIN participants p ON p.id = a.participant_id
    WHERE p.email = ${email.trim().toLowerCase()}
      AND a.status IN ('invited', 'confirmed', 'attended')
    ORDER BY a.assigned_at DESC LIMIT 1;`;
  return rows.length > 0
    ? { assignmentId: asString(rows[0].id), slotId: asString(rows[0].slot_id) }
    : null;
}
