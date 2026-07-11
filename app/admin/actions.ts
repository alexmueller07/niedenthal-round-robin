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
  createAssignment,
  createRa,
  createSlot,
  getAssignment,
  getParticipantById,
  getSlot,
  listAssignmentsForSlot,
  setAssignmentRole,
  setAssignmentStatus,
  setParticipantStatus,
  setRaActive,
  setRaAvailability,
  setSlotStatus,
  updateSetting,
} from "@/lib/db";
import { baseUrl, sendEmail } from "@/lib/email";
import { alternateToPromote, attendedRoster, isLive, propose } from "@/lib/engine";
import { formatDate, formatTimeRange } from "@/lib/format";
import { loadFullState } from "@/lib/snapshot";
import {
  cancellationEmail,
  invitationEmail,
  rescheduleEmail,
} from "@/lib/templates";
import type { AssignmentRole, ParticipantStatus } from "@/lib/types";

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

export async function createSlotsAction(formData: FormData): Promise<{ error?: string }> {
  await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  const repeatWeeks = Math.min(12, Math.max(1, Number(formData.get("repeatWeeks") ?? 1) || 1));
  const followUpOf = String(formData.get("followUpOf") ?? "") || null;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Pick a date." };
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return { error: "Pick a start and end time." };
  }
  if (endTime <= startTime) return { error: "End time must be after start time." };

  const [y, m, d] = date.split("-").map(Number);
  for (let week = 0; week < repeatWeeks; week++) {
    const day = new Date(y, m - 1, d + week * 7);
    const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(
      day.getDate()
    ).padStart(2, "0")}`;
    await createSlot({ date: iso, startTime, endTime, followUpOf });
  }

  refreshAdmin();
  return {};
}

export async function cancelSlotAction(slotId: string): Promise<void> {
  await requireAdmin();
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
  refreshAdmin();
}

export async function completeSlotAction(slotId: string): Promise<void> {
  await requireAdmin();
  await setSlotStatus(slotId, "completed");
  refreshAdmin();
}

// ------------------------------------------------------------------------ RAs

export async function addRaAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (name) await createRa(name);
  refreshAdmin();
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
