// Where the Lab Suite's Control Center lands: it arrives holding a one-minute
// token minted from the shared secret, this exchanges it for the ordinary
// admin session, and the RA sees the dashboard without typing anything.
//
// A stale or forged token falls through to the normal password page rather
// than erroring — the worst case for someone who waited too long is the
// login screen they would have seen anyway.

import { redirect } from "next/navigation";

import { createAdminSession, isAdmin, verifyControlLoginToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  if (await isAdmin()) redirect("/admin");

  const { token } = await searchParams;
  if (token && verifyControlLoginToken(token)) {
    await createAdminSession();
    redirect("/admin");
  }

  redirect("/admin/login");
}
