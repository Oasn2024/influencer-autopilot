import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const links = [
  ["/dashboard/compose", "Compose"],
  ["/dashboard/posts", "Posts"],
  ["/dashboard/autopilot", "Autopilot"],
  ["/dashboard/monitor", "Monitor"],
  ["/dashboard/accounts", "Accounts"],
  ["/dashboard/developers", "API"],
] as const;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-5xl items-center gap-x-5 gap-y-2 overflow-x-auto px-4 py-3">
          <Link href="/dashboard" className="shrink-0 font-semibold">Autopilot</Link>
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="shrink-0 text-sm text-muted hover:text-foreground">{label}</Link>
          ))}
          <div className="ml-auto shrink-0"><UserButton /></div>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
