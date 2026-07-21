"use server";

// Admin server actions. Every action begins with requireAdmin().

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  checkAdminPassword,
  clearAdminSession,
  createAdminSession,
  createConfirmToken,
  requireAdmin,
} from "@/lib/auth";
import {
  addBlackoutDate,
  clearShiftHead,
  createAssignment,
  createRa,
  createSlot,
  createSlotsBulk,
  deleteSlots,
  getAssignment,
  getParticipantById,
  getSettings,
  getSlot,
  listAssignmentsForSlot,
  listBlackoutDates,
  listSlots,
  listWeeklyShifts,
  removeBlackoutDate,
  setAssignmentLiveStatus,
  setAssignmentNeedsHelp,
  setAssignmentRole,
  setAssignmentStatus,
  setParticipantStatus,
  setRaActive,
  setRaAvailability,
  setRaIdentity,
  setRaShift,
  setShiftHead,
  setSlotCurrentRound,
  setSlotHeadRa,
  setSlotRotation,
  setSlotStatus,
  setWeeklyShiftActive,
  setWeeklyShiftPreferred,
  setWeeklyShiftRooms,
  slotIdsWithParticipants,
  updateSetting,
  upsertWeeklyShift,
} from "@/lib/db";
import type { PaintBlock } from "@/lib/availability";
import { baseUrl, sendEmail } from "@/lib/email";
import { alternateToPromote, attendedRoster, isLive, propose } from "@/lib/engine";
import { formatDate, formatTimeRange } from "@/lib/format";
import { generateShiftSlots } from "@/lib/schedule";
import { generateRotation } from "@/lib/rotation";
import { loadFullState } from "@/lib/snapshot";
import {
  cancellationEmail,
  invitationEmail,
  rescheduleEmail,
} from "@/lib/templates";
import type { AssignmentRole, LiveStatus, ParticipantStatus, Weekday } from "@/lib/types";

const LIVE_STATUSES: LiveStatus[] = ["waiting", "in_conversation", "at_survey", "done"];
const CONVERSATION_ROUNDS = 3;

function refreshAdmin(): void {
  revalidatePath("/admin", "layout");
  revalidatePath("/");
}

function confirmUrlFor(assignmentId: string): string {
  return `${baseUrl()}/confirm/${encodeURIComponent(createConfirmToken(assignmentId))}`;
}

// ----------------------------------------------------------------------- auth

export async function loginAdmin(formData: FormData): Promise<{ error?: string }> {
  const password = String(formData.get("password") ?? "");
  if (!checkAdminPassword(password)) {
    return { error: "Incorrect password." };
  }
  await createAdminSession();
  redirect("/admin");
}

export async function logoutAdmin(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

// ---------------------------------------------------------------------- slots

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Creates a follow-up session for one parent session. Follow-ups are the only
 * remaining way to make a dated slot by hand — everything else comes from the
 * weekly schedule — and they only admit the parent session's attendees.
 */
export async function createFollowUpSlotAction(
  parentSlotId: string,
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");

  if (!DATE_RE.test(date)) return { error: "Pick a date." };
  if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) {
    return { error: "Pick a start and end time." };
  }
  if (endTime <= startTime) return { error: "End time must be after start time." };

  const parent = await getSlot(parentSlotId);
  if (!parent) return { error: "Parent session not found." };

  await createSlot({
    date,
    startTime,
    endTime,
    roomCount: parent.roomCount,
    followUpOf: parentSlotId,
  });
  refreshAdmin();
  return {};
}

/**
 * Cancels a session and tells everyone on it. Shared by the per-session Cancel
 * button and by bulk removal, so nobody ever loses a session silently.
 */
async function cancelSlot(slotId: string): Promise<void> {
  const slot = await getSlot(slotId);
  if (!slot) return;

  await setSlotStatus(slotId, "canceled");

  const assignments = await listAssignmentsForSlot(slotId);
  for (const a of assignments) {
    if (!isLive(a.status)) continue;
    await setAssignmentStatus(a.id, "canceled");
    const participant = await getParticipantById(a.participantId);
    if (participant) {
      await sendEmail({
        toEmail: participant.email,
        participantId: participant.id,
        slotId,
        content: cancellationEmail(participant, slot),
      });
    }
  }
}

export async function cancelSlotAction(slotId: string): Promise<void> {
  await requireAdmin();
  await cancelSlot(slotId);
  refreshAdmin();
}

export async function completeSlotAction(slotId: string): Promise<void> {
  await requireAdmin();
  await setSlotStatus(slotId, "completed");
  refreshAdmin();
}

// ------------------------------------------------------------------------ RAs

const NETID_RE = /^[a-z0-9]+$/;

export async function addRaAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const netid = String(formData.get("netid") ?? "").trim().toLowerCase();
  if (!name) return { error: "Enter the RA's name." };
  if (netid && !NETID_RE.test(netid)) {
    return { error: "NetID should be letters and numbers only, without @wisc.edu." };
  }
  await createRa(name, netid || null);
  refreshAdmin();
  return {};
}

/**
 * Sets the NetID an RA signs in to /ra with. This is the access list for the
 * RA availability portal, so an unknown NetID must not be able to claim a page.
 */
export async function setRaIdentityAction(
  raId: string,
  netidRaw: string,
  emailRaw: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const netid = netidRaw.trim().toLowerCase();
  const email = emailRaw.trim().toLowerCase();
  if (netid && !NETID_RE.test(netid)) {
    return { error: "NetID should be letters and numbers only, without @wisc.edu." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "That doesn't look like a valid email address." };
  }
  await setRaIdentity(raId, netid || null, email || null);
  refreshAdmin();
  return {};
}

export async function setRaActiveAction(raId: string, active: boolean): Promise<void> {
  await requireAdmin();
  await setRaActive(raId, active);
  refreshAdmin();
}

export async function toggleRaSlotAction(
  raId: string,
  slotId: string,
  available: boolean
): Promise<void> {
  await requireAdmin();
  await setRaAvailability(raId, slotId, available);
  refreshAdmin();
}

// -------------------------------------------------------------- weekly shifts

export interface WeeklyScheduleResult {
  created: number;
  retired: number;
  error?: string;
}

/**
 * Replaces the weekly schedule with what the admin painted.
 *
 * Shifts that disappear from the paint are *deactivated*, never deleted:
 * already-generated sessions reference them, and RAs are assigned to them.
 * Deactivating stops future generation while keeping that history intact, and
 * repainting the same time brings the original row (and its RA assignments)
 * straight back.
 */
export async function setWeeklyScheduleAction(
  painted: PaintBlock[]
): Promise<WeeklyScheduleResult> {
  await requireAdmin();

  if (!Array.isArray(painted) || painted.length > 200) {
    return { created: 0, retired: 0, error: "Invalid selection." };
  }
  for (const b of painted) {
    const weekday = Number(b.column);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { created: 0, retired: 0, error: "Invalid day in the painted schedule." };
    }
    if (!TIME_RE.test(b.startTime) || !TIME_RE.test(b.endTime) || b.endTime <= b.startTime) {
      return { created: 0, retired: 0, error: "Invalid time in the painted schedule." };
    }
  }

  const existing = await listWeeklyShifts();
  const keep = new Set(painted.map((b) => `${Number(b.column)}|${b.startTime}`));

  let created = 0;
  for (const b of painted) {
    const result = await upsertWeeklyShift({
      weekday: Number(b.column) as Weekday,
      startTime: b.startTime,
      endTime: b.endTime,
    });
    if (result.created) created += 1;
  }

  let retired = 0;
  for (const shift of existing) {
    if (shift.active && !keep.has(`${shift.weekday}|${shift.startTime}`)) {
      await setWeeklyShiftActive(shift.id, false);
      retired += 1;
    }
  }

  refreshAdmin();
  return { created, retired };
}

export async function setWeeklyShiftRoomsAction(
  shiftId: string,
  roomCount: number
): Promise<void> {
  await requireAdmin();
  const rooms = Math.min(3, Math.max(1, Math.floor(roomCount) || 3));
  await setWeeklyShiftRooms(shiftId, rooms);
  refreshAdmin();
}

export async function setWeeklyShiftActiveAction(
  shiftId: string,
  active: boolean
): Promise<void> {
  await requireAdmin();
  await setWeeklyShiftActive(shiftId, active);
  refreshAdmin();
}

export async function setWeeklyShiftPreferredAction(
  shiftId: string,
  preferred: boolean
): Promise<void> {
  await requireAdmin();
  await setWeeklyShiftPreferred(shiftId, preferred);
  refreshAdmin();
}

export async function toggleRaShiftAction(
  raId: string,
  shiftId: string,
  assigned: boolean
): Promise<void> {
  await requireAdmin();
  await setRaShift(raId, shiftId, assigned);
  refreshAdmin();
}

/** Makes one RA the head of a shift, demoting whoever held it before. */
export async function setShiftHeadAction(raId: string, shiftId: string): Promise<void> {
  await requireAdmin();
  await setShiftHead(raId, shiftId);
  refreshAdmin();
}

export async function clearShiftHeadAction(shiftId: string): Promise<void> {
  await requireAdmin();
  await clearShiftHead(shiftId);
  refreshAdmin();
}

/**
 * Per-session head override. Also marks that RA as covering the slot, since a
 * head who isn't on the session doesn't count (see headRaBySlot in snapshot.ts).
 */
export async function setSlotHeadRaAction(
  slotId: string,
  raId: string | null
): Promise<void> {
  await requireAdmin();
  if (raId) await setRaAvailability(raId, slotId, true);
  await setSlotHeadRa(slotId, raId);
  refreshAdmin();
}

export interface GenerateResult {
  created: number;
  error?: string;
}

/**
 * Generates dated session slots from the active weekly shifts across the
 * configured semester window. Idempotent — existing (date, start_time) slots
 * are left untouched, so re-running only fills gaps (e.g. after adding a shift
 * or extending the semester).
 */
export async function generateSemesterSlotsAction(): Promise<GenerateResult> {
  await requireAdmin();
  const [shifts, settings] = await Promise.all([listWeeklyShifts(), getSettings()]);
  const active = shifts.filter((s) => s.active);
  if (active.length === 0) {
    return { created: 0, error: "Add at least one weekly shift first." };
  }
  if (settings.semesterEnd < settings.semesterStart) {
    return { created: 0, error: "Semester end is before its start — fix the dates below." };
  }

  const blackout = new Set((await listBlackoutDates()).map((b) => b.date));
  const generated = generateShiftSlots(
    active,
    settings.semesterStart,
    settings.semesterEnd,
    blackout
  );
  const created = await createSlotsBulk(
    generated.map((g) => ({
      date: g.date,
      startTime: g.startTime,
      endTime: g.endTime,
      roomCount: g.roomCount,
      shiftId: g.shiftId,
      preferred: g.preferred,
    }))
  );
  refreshAdmin();
  return { created };
}

// ------------------------------------------------------------ blackout dates

/**
 * Marks a date as a no-session day. Any already-generated sessions on it are
 * removed: empty ones are deleted outright, ones with people on them are
 * canceled so those participants get an email rather than silently losing
 * their session.
 */
export async function addBlackoutDateAction(
  date: string,
  label = ""
): Promise<{ deleted: number; canceled: number; error?: string }> {
  await requireAdmin();
  if (!DATE_RE.test(date)) return { deleted: 0, canceled: 0, error: "Invalid date." };

  await addBlackoutDate(date, label.slice(0, 80));

  const onThatDay = (await listSlots()).filter(
    (s) => s.date === date && s.status !== "canceled"
  );
  const { deleted, canceled } = await removeSessions(onThatDay.map((s) => s.id));

  refreshAdmin();
  return { deleted, canceled };
}

export async function removeBlackoutDateAction(date: string): Promise<void> {
  await requireAdmin();
  if (!DATE_RE.test(date)) return;
  await removeBlackoutDate(date);
  refreshAdmin();
}

// -------------------------------------------------------- deleting sessions

/**
 * Removes sessions, splitting by whether anyone is counting on them: empty
 * sessions are hard-deleted, sessions with live or attended assignments go
 * through cancelSlot so their participants are emailed and re-queued.
 */
async function removeSessions(
  slotIds: readonly string[]
): Promise<{ deleted: number; canceled: number }> {
  if (slotIds.length === 0) return { deleted: 0, canceled: 0 };
  const withPeople = await slotIdsWithParticipants(slotIds);

  const deletable = slotIds.filter((id) => !withPeople.has(id));
  const deleted = await deleteSlots(deletable);

  let canceled = 0;
  for (const id of slotIds) {
    if (!withPeople.has(id)) continue;
    await cancelSlot(id);
    canceled += 1;
  }
  return { deleted, canceled };
}

export interface DeleteSessionsResult {
  deleted: number;
  canceled: number;
  error?: string;
}

/** Bulk "undo a generation" — everything generated in a date range. */
export async function deleteSessionsAction(
  slotIds: string[]
): Promise<DeleteSessionsResult> {
  await requireAdmin();
  if (!Array.isArray(slotIds) || slotIds.length === 0) {
    return { deleted: 0, canceled: 0, error: "Nothing selected." };
  }
  if (slotIds.length > 2000) {
    return { deleted: 0, canceled: 0, error: "Too many sessions in one go." };
  }
  const result = await removeSessions(slotIds);
  refreshAdmin();
  return result;
}

// --------------------------------------------------------------- participants

export async function setParticipantStatusAction(
  participantId: string,
  status: ParticipantStatus
): Promise<void> {
  await requireAdmin();
  await setParticipantStatus(participantId, status);
  refreshAdmin();
}

// ------------------------------------------------------------------- settings

export async function updateSettingsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const fields: Array<{ form: string; key: string; min: number; max: number }> = [
    { form: "groupMin", key: "group_min", min: 2, max: 20 },
    { form: "groupMax", key: "group_max", min: 2, max: 20 },
    { form: "overrecruit", key: "overrecruit", min: 0, max: 10 },
    { form: "minRas", key: "min_ras", min: 1, max: 10 },
    { form: "seed", key: "seed", min: 1, max: Number.MAX_SAFE_INTEGER },
    { form: "conversationMinutes", key: "conversation_minutes", min: 1, max: 120 },
  ];
  const values = new Map<string, number>();
  for (const f of fields) {
    const n = Number(formData.get(f.form));
    if (!Number.isFinite(n) || n < f.min || n > f.max) {
      return { error: `Invalid value for ${f.form}.` };
    }
    values.set(f.key, Math.floor(n));
  }
  const groupMin = values.get("group_min") ?? 6;
  const groupMax = values.get("group_max") ?? 8;
  if (groupMax < groupMin) return { error: "Group max must be ≥ group min." };

  for (const [key, value] of values) {
    await updateSetting(key, String(value));
  }
  await updateSetting(
    "require_head_ra",
    formData.get("requireHeadRa") === "on" ? "true" : "false"
  );
  refreshAdmin();
  return {};
}

/** Updates just the semester window (owned by the shift page's generator). */
export async function updateSemesterAction(
  formData: FormData
): Promise<{ error?: string }> {
  await requireAdmin();
  const semesterStart = String(formData.get("semesterStart") ?? "");
  const semesterEnd = String(formData.get("semesterEnd") ?? "");
  if (!DATE_RE.test(semesterStart) || !DATE_RE.test(semesterEnd)) {
    return { error: "Pick a semester start and end date." };
  }
  if (semesterEnd < semesterStart) {
    return { error: "Semester end must be on or after its start." };
  }
  await updateSetting("semester_start", semesterStart);
  await updateSetting("semester_end", semesterEnd);
  refreshAdmin();
  return {};
}

// ------------------------------------------------------------------ scheduler

export interface ScheduleSummary {
  seed: number;
  slots: Array<{
    slotId: string;
    label: string;
    invited: Array<{ name: string; email: string; role: AssignmentRole }>;
    existingLive: number;
    projectedMembers: number;
  }>;
  unfillable: Array<{ label: string; eligible: number; needed: number }>;
  unplacedCount: number;
  /** Sessions being filled with nobody designated to lead them. */
  headless: string[];
  applied: boolean;
}

async function computeSchedule(apply: boolean): Promise<ScheduleSummary> {
  const state = await loadFullState();
  const proposal = propose(state.snapshot);

  const participantById = new Map(state.participants.map((p) => [p.id, p]));
  const slotById = new Map(state.slots.map((s) => [s.id, s]));
  const labelFor = (slotId: string): string => {
    const s = slotById.get(slotId);
    return s ? `${formatDate(s.date)}, ${formatTimeRange(s.startTime, s.endTime)}` : slotId;
  };

  const summary: ScheduleSummary = {
    seed: proposal.seed,
    slots: proposal.slots.map((sp) => ({
      slotId: sp.slotId,
      label: labelFor(sp.slotId),
      invited: sp.invitees.map((i) => {
        const p = participantById.get(i.participantId);
        return {
          name: p?.fullName ?? "Unknown",
          email: p?.email ?? "",
          role: i.role,
        };
      }),
      existingLive: sp.existingLive,
      projectedMembers: sp.projectedMembers,
    })),
    unfillable: proposal.unfillable.map((u) => ({
      label: labelFor(u.slotId),
      eligible: u.eligible,
      needed: u.needed,
    })),
    unplacedCount: proposal.unplaced.length,
    headless: proposal.headless.map(labelFor),
    applied: apply,
  };

  if (!apply) return summary;

  for (const sp of proposal.slots) {
    const slot = slotById.get(sp.slotId);
    if (!slot) continue;
    for (const invitee of sp.invitees) {
      const assignment = await createAssignment(invitee.participantId, sp.slotId, invitee.role);
      const participant = participantById.get(invitee.participantId);
      if (participant) {
        await sendEmail({
          toEmail: participant.email,
          participantId: participant.id,
          slotId: sp.slotId,
          content: invitationEmail(participant, slot, confirmUrlFor(assignment.id)),
        });
      }
    }
    if (sp.projectedMembers >= state.settings.groupMin) {
      await setSlotStatus(sp.slotId, "scheduled");
    }
  }

  refreshAdmin();
  return summary;
}

export async function previewScheduleAction(): Promise<ScheduleSummary> {
  await requireAdmin();
  return computeSchedule(false);
}

export async function applyScheduleAction(): Promise<ScheduleSummary> {
  await requireAdmin();
  return computeSchedule(true);
}

// ----------------------------------------------------------------- attendance

export interface AttendanceResult {
  promoted: string | null;
  rescheduledTo: string | null;
}

/**
 * Marks attendance. For a member no-show/cancel: promotes the senior confirmed
 * alternate into the seat, then immediately re-invites the missing participant
 * to their next compatible session (Randy's automatic no-show handling).
 */
export async function markAttendanceAction(
  assignmentId: string,
  status: "attended" | "no_show" | "canceled"
): Promise<AttendanceResult> {
  await requireAdmin();
  const result: AttendanceResult = { promoted: null, rescheduledTo: null };

  const assignment = await getAssignment(assignmentId);
  if (!assignment) return result;

  await setAssignmentStatus(assignmentId, status);
  if (status === "attended") {
    refreshAdmin();
    return result;
  }

  // Promote an alternate into the vacated member seat.
  if (assignment.role === "member") {
    const slotAssignments = await listAssignmentsForSlot(assignment.slotId);
    const candidate = alternateToPromote(
      slotAssignments
        .filter((a) => a.id !== assignmentId)
        .map((a) => ({
          participantId: a.participantId,
          slotId: a.slotId,
          status: a.status,
          role: a.role,
          assignedAt: a.assignedAt,
        }))
    );
    if (candidate) {
      const promoteRow = slotAssignments.find(
        (a) =>
          a.participantId === candidate.participantId &&
          a.role === "alternate" &&
          a.status === "confirmed"
      );
      if (promoteRow) {
        await setAssignmentRole(promoteRow.id, "member");
        const promoted = await getParticipantById(candidate.participantId);
        result.promoted = promoted?.fullName ?? null;
      }
    }
  }

  // Automatically re-queue the missing participant into a future session.
  result.rescheduledTo = await rescheduleParticipant(
    assignment.participantId,
    assignment.slotId
  );

  refreshAdmin();
  return result;
}

/**
 * Finds the earliest compatible open slot with a free member seat and invites
 * the participant. Returns a display label or null when nothing fits yet.
 */
async function rescheduleParticipant(
  participantId: string,
  excludeSlotId: string
): Promise<string | null> {
  const state = await loadFullState();
  const participant = state.participants.find((p) => p.id === participantId);
  if (!participant || participant.status !== "active") return null;

  const mySlots = new Set(
    state.snapshot.availability
      .filter((a) => a.participantId === participantId)
      .map((a) => a.slotId)
  );

  const liveMembersBySlot = new Map<string, number>();
  for (const a of state.assignments) {
    if (isLive(a.status) && a.role === "member") {
      liveMembersBySlot.set(a.slotId, (liveMembersBySlot.get(a.slotId) ?? 0) + 1);
    }
  }

  const today = state.snapshot.today;
  const candidates = state.slots
    .filter((s) => {
      if (s.id === excludeSlotId || !mySlots.has(s.id)) return false;
      if (s.date < today || s.status === "canceled" || s.status === "completed") return false;
      if ((state.raCountBySlot.get(s.id) ?? 0) < state.settings.minRas) return false;
      if ((liveMembersBySlot.get(s.id) ?? 0) >= state.settings.groupMax) return false;
      if (s.followUpOf) {
        const roster = attendedRoster(state.snapshot.assignments, s.followUpOf);
        if (!roster.has(participantId)) return false;
      }
      return true;
    })
    .sort((a, b) =>
      a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date.localeCompare(b.date)
    );

  const target = candidates[0];
  if (!target) return null;

  const assignment = await createAssignment(participantId, target.id, "member");
  await sendEmail({
    toEmail: participant.email,
    participantId,
    slotId: target.id,
    content: rescheduleEmail(participant, target, confirmUrlFor(assignment.id)),
  });
  return `${formatDate(target.date)}, ${formatTimeRange(target.startTime, target.endTime)}`;
}

// ---------------------------------------------------- experimenter console

/** Stable per-slot offset so each session's rotation differs but is reproducible. */
function slotSeedOffset(slotId: string): number {
  let sum = 0;
  for (const ch of slotId) sum += ch.charCodeAt(0);
  return sum;
}

/**
 * Locks in the day-of room rotation for the people present (confirmed or
 * checked-in) and starts the session at round 1. Seeded + reproducible.
 */
export async function generateRotationAction(
  slotId: string
): Promise<{ error?: string }> {
  await requireAdmin();
  const [slot, assignments, settings] = await Promise.all([
    getSlot(slotId),
    listAssignmentsForSlot(slotId),
    getSettings(),
  ]);
  if (!slot) return { error: "Session not found." };

  const present = assignments
    .filter((a) => a.status === "confirmed" || a.status === "attended")
    .map((a) => a.participantId);

  if (present.length < 2) {
    return { error: "Need at least two people present to build a rotation." };
  }

  const rotation = generateRotation(present, {
    rooms: Math.max(1, slot.roomCount),
    rounds: CONVERSATION_ROUNDS,
    seed: settings.seed + slotSeedOffset(slotId),
  });
  await setSlotRotation(slotId, rotation, 1);
  refreshAdmin();
  return {};
}

export async function advanceRoundAction(
  slotId: string,
  direction: 1 | -1
): Promise<void> {
  await requireAdmin();
  const slot = await getSlot(slotId);
  if (!slot || !slot.rotation) return;
  const max = slot.rotation.length;
  const next = Math.min(max, Math.max(1, slot.currentRound + direction));
  await setSlotCurrentRound(slotId, next);
  refreshAdmin();
}

export async function setLiveStatusAction(
  assignmentId: string,
  status: LiveStatus
): Promise<void> {
  await requireAdmin();
  if (!LIVE_STATUSES.includes(status)) return;
  await setAssignmentLiveStatus(assignmentId, status);
  refreshAdmin();
}

export async function resolveHelpAction(assignmentId: string): Promise<void> {
  await requireAdmin();
  await setAssignmentNeedsHelp(assignmentId, false);
  refreshAdmin();
}
