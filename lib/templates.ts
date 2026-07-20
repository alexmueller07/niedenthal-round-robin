// Email templates. Plain text on purpose: university spam filters are kinder
// to it, and RAs can paste the body straight into the lab mail client when a
// send falls back to manual mode.

import { formatDate, formatTimeRange } from "./format";
import type { EmailTemplate, Participant, Slot } from "./types";

export interface EmailContent {
  template: EmailTemplate;
  subject: string;
  body: string;
}

const SIGNATURE = `\n\nThank you,\nNiedenthal Lab\nUniversity of Wisconsin–Madison`;

const LOCATION =
  "Brogden Psychology Building, 1202 W Johnson St — follow the posted signs to the orientation room.";

function firstName(p: Participant): string {
  return p.fullName.trim().split(/\s+/)[0] || "there";
}

function slotLine(slot: Slot): string {
  return `${formatDate(slot.date)}, ${formatTimeRange(slot.startTime, slot.endTime)}`;
}

export function invitationEmail(
  participant: Participant,
  slot: Slot,
  confirmUrl: string
): EmailContent {
  return {
    template: "invitation",
    subject: `Your study session: ${slotLine(slot)}`,
    body: `Hi ${firstName(participant)},

You have been scheduled for a session of the conversation study:

  ${slotLine(slot)}
  ${LOCATION}

Please confirm your attendance by clicking this link:

  ${confirmUrl}

If you can no longer make this time, reply to this email as soon as possible so we can offer your seat to another participant and find you a new time.${SIGNATURE}`,
  };
}

export function confirmationEmail(participant: Participant, slot: Slot): EmailContent {
  return {
    template: "confirmation",
    subject: `Confirmed: ${slotLine(slot)}`,
    body: `Hi ${firstName(participant)},

You are confirmed for:

  ${slotLine(slot)}
  ${LOCATION}

We look forward to seeing you. If anything changes, reply to this email as soon as possible.${SIGNATURE}`,
  };
}

export function reminderEmail(participant: Participant, slot: Slot): EmailContent {
  return {
    template: "reminder",
    subject: `Reminder — your study session is tomorrow (${slotLine(slot)})`,
    body: `Hi ${firstName(participant)},

A quick reminder that your session of the conversation study is tomorrow:

  ${slotLine(slot)}
  ${LOCATION}

If you can no longer attend, please reply to this email right away.${SIGNATURE}`,
  };
}

export function rescheduleEmail(
  participant: Participant,
  slot: Slot,
  confirmUrl: string
): EmailContent {
  return {
    template: "reschedule",
    subject: `New session time: ${slotLine(slot)}`,
    body: `Hi ${firstName(participant)},

We missed you at your previous session — no problem. You have been rescheduled to:

  ${slotLine(slot)}
  ${LOCATION}

Please confirm your new time by clicking this link:

  ${confirmUrl}

If this time no longer works, reply to this email and we will find another.${SIGNATURE}`,
  };
}

export function cancellationEmail(participant: Participant, slot: Slot): EmailContent {
  return {
    template: "cancellation",
    subject: `Session canceled: ${slotLine(slot)}`,
    body: `Hi ${firstName(participant)},

Your session on ${slotLine(slot)} has been canceled. We are sorry for the change.

Your availability is still on file and we will send you a new session time soon. You can also update your availability any time using your original study link.${SIGNATURE}`,
  };
}
