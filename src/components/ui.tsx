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
    <div className="h-full rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function PageHeader({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">{title}</h1>
      {children && <p className="mt-1 text-sm text-muted">{children}</p>}
    </div>
  );
}

export function formatWhen(d: Date | string | null | undefined, timeZone?: string): string {
  if (!d) return "not scheduled";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(d));
}

export const buttonClass = "rounded-md border border-border px-3 py-1 text-sm hover:bg-card disabled:opacity-50";
export const primaryButtonClass = "rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50";
export const inputClass = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
