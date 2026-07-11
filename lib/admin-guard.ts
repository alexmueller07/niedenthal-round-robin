import "server-only";
import { redirect } from "next/navigation";
import { isAdmin } from "./auth";

/** Call at the top of every admin page. */
export async function requireAdminPage(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}
