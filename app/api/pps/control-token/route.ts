// Mints the one-minute login token the Lab Suite's Control Center uses to
// open this dashboard without an RA typing the lab password.
//
// Gated by the same shared secret the desktop apps already authenticate every
// other call with, so possession of the secret — which only ever lives inside
// the installed app — is what buys the session. See createControlLoginToken.

import { createControlLoginToken } from "@/lib/auth";
import { checkPpsSecret } from "@/lib/control-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!checkPpsSecret(request)) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json({ token: createControlLoginToken() });
}
