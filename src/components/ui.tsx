import Link from "next/link";

const tone: Record<string, string> = {
  published: "bg-green-500/15 text-green-700 dark:text-green-300",
  active: "bg-green-500/15 text-green-700 dark:text-green-300",
  info: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  publishing: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  pending: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  pending_approval: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  partial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  expired: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  failed: "bg-red-500/15 text-red-700 dark:text-red-300",
  error: "bg-red-500/15 text-red-700 dark:text-red-300",
  revoked: "bg-red-500/15 text-red-700 dark:text-red-300",
};

const labels: Record<string, string> = { pending_approval: "needs approval", pending: "queued" };

export function Badge({ status }: { status: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone[status] ?? "bg-card text-muted border border-border"}`}>
      {labels[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

export function StatCard({ title, value, href, note }: { title: string; value: string | number; href?: string; note?: string }) {
  const body = (
    <div className="h-full rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-accent/50">
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export function formatWhen(d: Date | string | null | undefined, timeZone?: string): string {
  if (!d) return "not scheduled";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(d));
}

export const buttonClass = "rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:border-accent/50 disabled:opacity-50";
export const primaryButtonClass = "bg-brand rounded-lg px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50";
export const inputClass = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-accent focus:outline-none";

/** A small brand-colored dot + platform name. */
export function PlatformChip({ name, color, detail, className = "" }: { name: string; color: string; detail?: string; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs font-medium ${className}`}>
      <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />
      {name}
      {detail && <span className="font-normal text-muted">{detail}</span>}
    </span>
  );
}
