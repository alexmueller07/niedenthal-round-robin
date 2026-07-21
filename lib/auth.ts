// Auth: shared lab password for /admin (HMAC-signed session cookie), a
// lightweight signed cookie identifying the participant on the portal, and
// signed one-click confirm tokens for emails. Server-only module.

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "rr_admin";
const PARTICIPANT_COOKIE = "rr_participant";
const RA_COOKIE = "rr_ra";
const ADMIN_TTL_MS = 1000 * 60 * 60 * 12; // 12h — one lab day
const PARTICIPANT_TTL_MS = 1000 * 60 * 60 * 24 * 90; // the study window
const RA_TTL_MS = 1000 * 60 * 60 * 24 * 120; // a semester
const CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 14;

function secret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function pack(...fields: string[]): string {
  const payload = fields.map(encodeURIComponent).join(".");
  return `${payload}.${sign(payload)}`;
}

/** Returns the decoded fields when the signature and expiry check out. */
function unpack(token: string, fieldCount: number): string[] | null {
  const parts = token.split(".");
  if (parts.length !== fieldCount + 1) return null;
  const payload = parts.slice(0, fieldCount).join(".");
  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(parts[fieldCount]);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }
  return parts.slice(0, fieldCount).map(decodeURIComponent);
}

function fresh(expiresAtMs: string): boolean {
  const exp = Number(expiresAtMs);
  return Number.isFinite(exp) && Date.now() < exp;
}

// ----------------------------------------------------------------- admin auth

export function checkAdminPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function createAdminSession(): Promise<void> {
  const exp = String(Date.now() + ADMIN_TTL_MS);
  const store = await cookies();
  store.set(ADMIN_COOKIE, pack("admin", exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ADMIN_TTL_MS / 1000,
    path: "/",
  });
}

export async function isAdmin(): Promise<boolean> {
  const store = await cookies();
  const token = store.get(ADMIN_COOKIE)?.value;
  if (!token) return false;
  const fields = unpack(token, 2);
  return fields !== null && fields[0] === "admin" && fresh(fields[1]);
}

/** Guard for admin server actions and route handlers. */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) throw new Error("Unauthorized");
}

export async function clearAdminSession(): Promise<void> {
  const store = await cookies();
  store.delete(ADMIN_COOKIE);
}

// ----------------------------------------------------------- participant auth

export async function setParticipantSession(participantId: string): Promise<void> {
  const exp = String(Date.now() + PARTICIPANT_TTL_MS);
  const store = await cookies();
  store.set(PARTICIPANT_COOKIE, pack(participantId, exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: PARTICIPANT_TTL_MS / 1000,
    path: "/",
  });
}

export async function getParticipantSession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PARTICIPANT_COOKIE)?.value;
  if (!token) return null;
  const fields = unpack(token, 2);
  return fields !== null && fresh(fields[1]) ? fields[0] : null;
}

export async function clearParticipantSession(): Promise<void> {
  const store = await cookies();
  store.delete(PARTICIPANT_COOKIE);
}

// -------------------------------------------------------------------- RA auth

// RAs get their own session for /ra (submitting shift availability). It is
// deliberately NOT the admin session: an RA reporting when they're free should
// not need the shared lab password, and holding it must not grant admin.

export async function setRaSession(raId: string): Promise<void> {
  const exp = String(Date.now() + RA_TTL_MS);
  const store = await cookies();
  store.set(RA_COOKIE, pack(raId, exp), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: RA_TTL_MS / 1000,
    path: "/",
  });
}

export async function getRaSession(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(RA_COOKIE)?.value;
  if (!token) return null;
  const fields = unpack(token, 2);
  return fields !== null && fresh(fields[1]) ? fields[0] : null;
}

export async function clearRaSession(): Promise<void> {
  const store = await cookies();
  store.delete(RA_COOKIE);
}

// ------------------------------------------------------------- confirm tokens

/** One-click token embedded in invitation emails. */
export function createConfirmToken(assignmentId: string): string {
  const exp = String(Date.now() + CONFIRM_TTL_MS);
  return pack("confirm", assignmentId, exp);
}

export function verifyConfirmToken(token: string): string | null {
  const fields = unpack(token, 3);
  if (fields === null || fields[0] !== "confirm" || !fresh(fields[2])) return null;
  return fields[1];
}
