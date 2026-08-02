// LINKS — the things RAs open while running a session, in one place.

import { requireAdminPage } from "@/lib/admin-guard";
import { listRaLinks } from "@/lib/db";
import LinkList from "@/app/components/LinkList";
import LinksManager from "./LinksManager";

export const dynamic = "force-dynamic";

export default async function LinksPage() {
  await requireAdminPage();
  const links = await listRaLinks();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Links</h1>
        <p className="mt-1 text-sm text-ink-soft">
          The script, the feedback doc, SONA — whatever an RA needs mid-session. This
          same list shows on every RA&apos;s portal, so they never have to go hunting
          through email for it.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">What RAs see</h2>
        <LinkList links={links} />
      </section>

      <section>
        <h2 className="mb-1 text-lg font-bold">Edit the list</h2>
        <p className="mb-4 text-sm text-ink-soft">
          Reorder with the arrows — put the one RAs reach for most at the top.
          Changes go live as soon as you save.
        </p>
        <LinksManager links={links} />
      </section>

      <p className="text-xs text-stone-500">
        Anything behind a UW login still needs the RA to be on WiscVPN or signed in —
        this list only saves them from finding the URL.
      </p>
    </div>
  );
}
