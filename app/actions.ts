"use server";

// Participant-facing server actions (portal sign-in, availability, confirm).

import { revalidatePath } from "next/cache";
import {
  clearParticipantSession,
  getParticipantSession,
  setParticipantSession,
} from "@/lib/auth";
import {
  getAssignment,
  getParticipantById,
  getSlot,
  listAssignmentsForParticipant,
  replaceParticipantAvailability,
  setAssignmentStatus,
  upsertParticipant,
} from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { confirmationEmail } from "@/lib/templates";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export async function signInParticipant(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("fullName") ?? "").trim();

  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (fullName.length === 0) {
    return { ok: false, error: "Please enter your full name." };
  }

  const participant = await upsertParticipant(email, fullName);
  await setParticipantSession(participant.id);
  revalidatePath("/");
  return { ok: true };
}

export async function signOutParticipant(): Promise<void> {
  await clearParticipantSession();
  revalidatePath("/");
}

export async function saveAvailability(slotIds: string[]): Promise<ActionResult> {
  const participantId = await getParticipantSession();
  if (!participantId) return { ok: false, error: "Your session expired — please sign in again." };
  if (!Array.isArray(slotIds) || slotIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Invalid selection." };
  }

  await replaceParticipantAvailability(participantId, slotIds);
  revalidatePath("/");
  return { ok: true };
}

/** Confirms the signed-in participant's own invitation (portal button). */
export async function confirmMyAssignment(assignmentId: string): Promise<ActionResult> {
  const participantId = await getParticipantSession();
  if (!participantId) return { ok: false, error: "Your session expired — please sign in again." };

  const assignment = await getAssignment(assignmentId);
  if (!assignment || assignment.participantId !== participantId) {
    return { ok: false, error: "Assignment not found." };
  }
  if (assignment.status !== "invited" && assignment.status !== "confirmed") {
    return { ok: false, error: "This session can no longer be confirmed." };
  }

  if (assignment.status === "invited") {
    await setAssignmentStatus(assignment.id, "confirmed");
    const [participant, slot] = await Promise.all([
      getParticipantById(participantId),
      getSlot(assignment.slotId),
    ]);
    if (participant && slot) {
      await sendEmail({
        toEmail: participant.email,
        participantId: participant.id,
        slotId: slot.id,
        content: confirmationEmail(participant, slot),
      });
    }
  }

  revalidatePath("/");
  return { ok: true };
}

/** True when the signed-in participant has any live assignment. */
export async function hasLiveAssignment(): Promise<boolean> {
  const participantId = await getParticipantSession();
  if (!participantId) return false;
  const assignments = await listAssignmentsForParticipant(participantId);
  return assignments.some((a) => a.status === "invited" || a.status === "confirmed");
}
