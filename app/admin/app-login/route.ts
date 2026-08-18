// Where the Lab Suite's Control Center lands: it arrives holding a one-minute
// token minted from the shared secret, this exchanges it for the ordinary
// admin session, and the RA sees the dashboard without typing anything.
//
// A route handler rather than a page because only Server Actions and Route
// Handlers may set cookies — a page that calls createAdminSession() during
// render throws.
//
// A stale or forged token falls through to the normal password page rather
// than erroring: the worst case for someone who waited too long is the login
// screen they would have seen anyway.

import { createAdminSession, isAdmin, verifyControlLoginToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const dashboard = new URL("/admin", request.url);
  const login = new URL("/admin/login", request.url);

  if (await isAdmin()) return Response.redirect(dashboard, 303);

  const token = new URL(request.url).searchParams.get("token");
  if (token && verifyControlLoginToken(token)) {
    await createAdminSession();
    return Response.redirect(dashboard, 303);
  }

  return Response.redirect(login, 303);
}
