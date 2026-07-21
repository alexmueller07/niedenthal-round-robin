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
  /** UW NetID, pre-registered by an admin so the RA can sign in to `/ra`. */
  netid: string | null;
  email: string | null;
  /**
   * When the RA last submitted shift availability. Null means "hasn't
   * responded" — distinct from submitting an empty set.
   */
  availabilitySubmittedAt: string | null;
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
  /**
   * Head RA for this specific session. Overrides the head on the slot's weekly
   * shift, and is the only way to set one on a one-off slot.
   */
  headRaId: string | null;
  notes: string;
}

/** A date the semester generator skips (holiday, break, finals week). */
export interface BlackoutDate {
  date: string;
  label: string;
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
  /** Where the participant is in the PPS app, as reported by that app. */
  ppsStage: string | null;
  ppsPercent: number | null;
  ppsUpdatedAt: string | null;
  assignedAt: string;
  decidedAt: string | null;
}

// ------------------------------------------------- Panopticon Control Center

/** What role a browser tab has claimed for a session. */
export type DeviceKind = "camera" | "station" | "control";
export type RecordingStatus = "recording" | "uploading" | "stored" | "failed";

export interface RoomDevice {
  id: string;
  slotId: string;
  kind: DeviceKind;
  /** 1-based conversation room, for `kind: "camera"`. */
  roomIndex: number | null;
  /** Which participant is at this station, for `kind: "station"`. */
  participantId: string | null;
  label: string;
  lastSeen: string;
  createdAt: string;
}

/**
 * One recorded conversation. `participantA`/`participantB` are stamped from the
 * rotation at record time — that stamp is what routes the clip to the right
 * participants' rating stations.
 */
export interface Recording {
  id: string;
  slotId: string;
  round: number;
  roomIndex: number;
  participantA: string | null;
  participantB: string | null;
  /** Path relative to RECORDING_DIR. Never a URL — the file is served by route. */
  storageKey: string;
  mimeType: string;
  bytes: number;
  durationMs: number | null;
  status: RecordingStatus;
  startedAt: string;
  endedAt: string | null;
}

/** One WebRTC signaling message, addressed device-to-device. */
export interface Signal {
  id: number;
  slotId: string;
  fromDevice: string;
  toDevice: string;
  payload: unknown;
  createdAt: string;
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
  /** RAs required to staff a session before the engine will fill it. */
  minRas: number;
  seed: number;
  /** Semester window the generator fills with dated slots ("YYYY-MM-DD"). */
  semesterStart: string;
  semesterEnd: string;
  /** Conversation length; drives the room recorder's auto-stop. */
  conversationMinutes: number;
  /**
   * When true, a session without a designated head RA is not fillable at all.
   * When false (default) it still fills, but is flagged everywhere it appears.
   *
   * Randy asked for a head RA to be required; this is off for now so scheduling
   * isn't blocked before heads are assigned. Flip it on from Advanced settings.
   */
  requireHeadRa: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  groupMin: 6,
  groupMax: 8,
  overrecruit: 2,
  minRas: 4,
  seed: 20260711,
  semesterStart: "2026-09-02",
  semesterEnd: "2026-12-11",
  conversationMinutes: 10,
  requireHeadRa: false,
};
