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
/** Where a participant is in the session flow, tracked on the live console. */
export type LiveStatus = "waiting" | "in_conversation" | "at_survey" | "done";
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
  /** UW NetID (lowercased), captured at sign-in. Nullable for pre-NetID rows. */
  netid: string | null;
  status: ParticipantStatus;
  /** True when the participant tapped "none of these times work for me". */
  declinedAll: boolean;
  createdAt: string;
}

export interface Ra {
  id: string;
  name: string;
  active: boolean;
}

/** 0 = Sunday … 6 = Saturday, matching JS Date.getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * A recurring weekly shift template. RAs are assigned to these once for the
 * semester (the "employee shift" model); dated `slots` are generated from the
 * active shifts across the semester date range.
 */
export interface WeeklyShift {
  id: string;
  weekday: Weekday;
  startTime: string;
  endTime: string;
  roomCount: number;
  /** Surfaced first to participants ("preferred times"). */
  preferred: boolean;
  active: boolean;
}

/** One conversation dyad placed in a room for a round. */
export interface Dyad {
  room: number; // 1-based
  a: string; // participant id
  b: string; // participant id
}

export interface RoundPlan {
  round: number; // 1-based
  dyads: Dyad[];
  sittingOut: string[];
}

/** The full day-of room rotation for a session. */
export type Rotation = RoundPlan[];

export interface Slot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  roomCount: number;
  status: SlotStatus;
  followUpOf: string | null;
  /** The weekly shift this slot was generated from, if any. */
  shiftId: string | null;
  /** Denormalized from the shift at generation time; drives portal ordering. */
  preferred: boolean;
  /** Locked-in day-of room rotation (null until the experimenter generates it). */
  rotation: Rotation | null;
  /** Which conversation round is live (0 = not started). */
  currentRound: number;
  notes: string;
}

export interface Assignment {
  id: string;
  participantId: string;
  slotId: string;
  status: AssignmentStatus;
  role: AssignmentRole;
  /** Live session progress, driven by the experimenter console. */
  liveStatus: LiveStatus;
  /** Raised by the participant (or an RA); cleared when help arrives. */
  needsHelp: boolean;
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
  /** Semester window the generator fills with dated slots ("YYYY-MM-DD"). */
  semesterStart: string;
  semesterEnd: string;
}

export const DEFAULT_SETTINGS: Settings = {
  groupMin: 6,
  groupMax: 8,
  overrecruit: 2,
  minRas: 2,
  seed: 20260711,
  semesterStart: "2026-09-02",
  semesterEnd: "2026-12-11",
};
