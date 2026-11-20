import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { DashboardNav } from "./nav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-border bg-sidebar md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col md:border-b-0 md:border-r">
        <div className="flex items-center gap-2 px-4 py-4">
          <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
            <span aria-hidden className="bg-brand grid size-7 place-items-center rounded-lg text-sm text-white">✦</span>
            Autopilot
          </Link>
          <div className="ml-auto md:hidden"><UserButton /></div>
        </div>
        <div className="px-3 pb-3 md:flex-1">
          <DashboardNav />
        </div>
        <div className="hidden items-center gap-3 border-t border-border px-4 py-3 text-sm text-muted md:flex">
          <UserButton />
          <span>Free during beta</span>
        </div>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 flex-1 px-4 py-8 md:px-8">{children}</main>
    </div>
  );
}
