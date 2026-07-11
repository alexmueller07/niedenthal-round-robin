// One-click confirmation landing page from invitation emails.

import Link from "next/link";
import { verifyConfirmToken } from "@/lib/auth";
import { getAssignment, getParticipantById, getSlot, setAssignmentStatus } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { formatDate, formatTimeRange } from "@/lib/format";
import { confirmationEmail } from "@/lib/templates";

export const dynamic = "force-dynamic";

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center">
        <p className="mb-6 text-sm font-semibold uppercase tracking-[0.2em] text-badger">
          Niedenthal Emotions Lab
        </p>
        {children}
        <p className="mt-8 text-sm text-stone-500">
          <Link href="/" className="underline underline-offset-4">
            Open the scheduler
          </Link>{" "}
          to see your sessions or update your availability.
        </p>
      </div>
    </main>
  );
}

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const assignmentId = verifyConfirmToken(decodeURIComponent(token));

  if (!assignmentId) {
    return (
      <Shell>
        <div className="card p-8">
          <h1 className="text-xl font-bold">This link has expired</h1>
          <p className="mt-2 text-ink-soft">
            No worries — sign in to the scheduler below and confirm your session
            there, or reply to your invitation email.
          </p>
        </div>
      </Shell>
    );
  }

  const assignment = await getAssignment(assignmentId);
  if (!assignment || (assignment.status !== "invited" && assignment.status !== "confirmed")) {
    return (
      <Shell>
        <div className="card p-8">
          <h1 className="text-xl font-bold">This session is no longer active</h1>
          <p className="mt-2 text-ink-soft">
            Your invitation may have been rescheduled or canceled. Sign in below to
            see your current session, or reply to your invitation email.
          </p>
        </div>
      </Shell>
    );
  }

  const [participant, slot] = await Promise.all([
    getParticipantById(assignment.participantId),
    getSlot(assignment.slotId),
  ]);

  if (assignment.status === "invited") {
    await setAssignmentStatus(assignment.id, "confirmed");
    if (participant && slot) {
      await sendEmail({
        toEmail: participant.email,
        participantId: participant.id,
        slotId: slot.id,
        content: confirmationEmail(participant, slot),
      });
    }
  }

  return (
    <Shell>
      <div className="card overflow-hidden">
        <div className="h-1.5 bg-badger" />
        <div className="p-8">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
            ✓
          </div>
          <h1 className="text-xl font-bold">You&apos;re confirmed!</h1>
          {slot && (
            <>
              <p className="mt-3 text-lg font-semibold">{formatDate(slot.date)}</p>
              <p className="text-ink-soft">{formatTimeRange(slot.startTime, slot.endTime)}</p>
            </>
          )}
          <p className="mt-4 border-t border-line pt-4 text-sm text-ink-soft">
            Brogden Psychology Building, 1202 W Johnson St — follow the signs to the
            orientation room. See you there!
          </p>
        </div>
      </div>
    </Shell>
  );
}
