import { requireAdminPage } from "@/lib/admin-guard";
import { listEmailLog } from "@/lib/db";
import EmailRow from "./EmailRow";

export const dynamic = "force-dynamic";

export default async function EmailsPage() {
  await requireAdminPage();
  const entries = await listEmailLog();
  const manual = entries.filter((e) => e.status === "manual" || e.status === "failed");
  const hasMailer = Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Emails</h1>
        <p className="mt-1 text-sm text-ink-soft">
          {hasMailer
            ? "Automatic sending is on (Resend)."
            : "No mail service configured — every email lands here for manual sending."}
          {manual.length > 0 &&
            ` ${manual.length} message${manual.length === 1 ? " needs" : "s need"} a manual send: copy the body into the lab mail account.`}
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="card p-6 text-ink-soft">
          Nothing yet — emails appear here when the scheduler sends invitations.
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {entries.map((entry) => (
            <EmailRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
    </div>
  );
}
