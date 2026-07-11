import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function AdminLoginPage() {
  if (await isAdmin()) redirect("/admin");

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-badger">
            Niedenthal Emotions Lab
          </p>
          <h1 className="mt-3 text-2xl font-bold tracking-tight">RA Dashboard</h1>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
