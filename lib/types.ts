// Shared domain types. All dates are Madison wall-clock: date = "YYYY-MM-DD",
// time = "HH:MM" 24h. Never convert through UTC — single-site study.

export type ParticipantStatus = "active" | "completed" | "withdrawn";
export type SlotStatus = "open" | "scheduled" | "completed" | "canceled";
export type AssignmentStatus =
  | "invited"
  | "confirmed"
  | "attended"
  | "no_show"
  | "canceled";
export type AssignmentRole = "member" | "alternate";
export type EmailStatus = "sent" | "failed" | "manual";
export type EmailTemplate =
  | "invitation"
  | "confirmation"
  | "reminder"
  | "reschedule"
  | "cancellation";

export interface Participant {
  id: string;
  email: string;
  fullName: string;
  status: ParticipantStatus;
  createdAt: string;
}

export interface Ra {
  id: string;
  name: string;
  active: boolean;
}

export interface Slot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  roomCount: number;
  status: SlotStatus;
  followUpOf: string | null;
  notes: string;
}

export interface Assignment {
  id: string;
  participantId: string;
  slotId: string;
  status: AssignmentStatus;
  role: AssignmentRole;
  assignedAt: string;
  decidedAt: string | null;
}

export interface EmailLogEntry {
  id: string;
  participantId: string | null;
  slotId: string | null;
  template: EmailTemplate;
  toEmail: string;
  subject: string;
  body: string;
  status: EmailStatus;
  createdAt: string;
}

export interface Settings {
  groupMin: number;
  groupMax: number;
  overrecruit: number;
  minRas: number;
  seed: number;
}

export const DEFAULT_SETTINGS: Settings = {
  groupMin: 6,
  groupMax: 8,
  overrecruit: 2,
  minRas: 2,
  seed: 20260711,
};
