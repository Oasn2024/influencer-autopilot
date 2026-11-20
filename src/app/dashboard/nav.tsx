"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Home", icon: "⌂" },
  { href: "/dashboard/compose", label: "Create", icon: "✦" },
  { href: "/dashboard/calendar", label: "Calendar", icon: "▦" },
  { href: "/dashboard/posts", label: "Posts", icon: "☰" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "▲" },
  { href: "/dashboard/autopilot", label: "Autopilot", icon: "⟳" },
  { href: "/dashboard/monitor", label: "Monitor", icon: "◉" },
  { href: "/dashboard/accounts", label: "Accounts", icon: "⚭" },
  { href: "/dashboard/developers", label: "API", icon: "</>" },
] as const;

export function DashboardNav() {
  const path = usePathname();
  const active = (href: string) => (href === "/dashboard" ? path === href : path.startsWith(href));
  return (
    <nav aria-label="Dashboard" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
            active(l.href) ? "bg-card font-semibold text-foreground shadow-sm ring-1 ring-border" : "text-muted hover:bg-card/60 hover:text-foreground"
          }`}
        >
          <span aria-hidden className={`w-4 text-center text-xs ${active(l.href) ? "text-accent" : ""}`}>{l.icon}</span>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
