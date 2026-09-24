"use server";

// RA-facing server actions: sign in with a pre-registered NetID, then submit
// which weekly shifts you can staff.
//
// Submissions are *availability*, not assignment. Randy still decides who
// actually staffs what on the Schedule page; this only answers "how do we know
// what people's availability is".

import { revalidatePath } from "next/cache";
import { clearRaSession, getRaSession, setRaSession } from "@/lib/auth";
import {
  getRaById,
  getRaByNetid,
  listWeeklyShifts,
  replaceRaShiftPreferences,
} from "@/lib/db";

/**
 * A NetID as the roster spells it: no domain, lower case. An RA who types
 * their whole address into the box gets signed in rather than corrected.
 */
function normalizeNetid(raw: string): string {
  return raw.trim().toLowerCase().split("@")[0] ?? "";
}

export interface RaActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Signs in an RA by NetID. The NetID must already be on the roster — an
 * unknown one is refused rather than creating an RA, so this page can't be
 * claimed by anyone outside the lab.
 */
export async function signInRa(formData: FormData): Promise<RaActionResult> {
  const netid = normalizeNetid(String(formData.get("netid") ?? ""));
  // The roster lookup below is the gate, and always was — the format check
  // that used to be here only decided which error message an outsider saw.
  if (!netid) {
    return { ok: false, error: "Enter your UW NetID." };
  }

  const ra = await getRaByNetid(netid);
  if (!ra) {
    return {
      ok: false,
      error:
        "That NetID isn't on the RA roster. Ask Randy to add it on the People page, then try again.",
    };
  }

  await setRaSession(ra.id);
  revalidatePath("/ra");
  return { ok: true };
}

export async function signOutRa(): Promise<void> {
  await clearRaSession();
  revalidatePath("/ra");
}

/** Replaces the signed-in RA's submitted availability with exactly `shiftIds`. */
export async function saveRaAvailability(shiftIds: string[]): Promise<RaActionResult> {
  const raId = await getRaSession();
  if (!raId) return { ok: false, error: "Your session expired — please sign in again." };

  const ra = await getRaById(raId);
  if (!ra || !ra.active) {
    return { ok: false, error: "This RA account is no longer active." };
  }

  if (!Array.isArray(shiftIds) || shiftIds.some((id) => typeof id !== "string")) {
    return { ok: false, error: "Invalid selection." };
  }

  // Only accept ids that are real, active shifts.
  const valid = new Set(
    (await listWeeklyShifts()).filter((s) => s.active).map((s) => s.id)
  );
  const filtered = [...new Set(shiftIds)].filter((id) => valid.has(id));

  await replaceRaShiftPreferences(raId, filtered);
  revalidatePath("/ra");
  revalidatePath("/admin", "layout");
  return { ok: true };
}
