import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-guard";
import { logoutAdmin } from "../actions";

const NAV = [
  { href: "/admin", label: "Board" },
  { href: "/admin/slots", label: "Slots & RAs" },
  { href: "/admin/schedule", label: "Scheduler" },
  { href: "/admin/participants", label: "Participants" },
  { href: "/admin/emails", label: "Emails" },
] as const;

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await requireAdminPage();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-badger text-sm font-black text-white">
              N
            </span>
            <span className="font-bold tracking-tight">Round Robin</span>
            <span className="hidden text-sm text-stone-400 sm:inline">· RA Dashboard</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-soft transition-colors hover:bg-stone-100 hover:text-ink"
              >
                {item.label}
              </Link>
            ))}
            <form action={logoutAdmin}>
              <button
                type="submit"
                className="ml-2 rounded-full px-3.5 py-1.5 text-sm text-stone-400 transition-colors hover:bg-stone-100 hover:text-ink"
              >
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
