import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, PageHeader, primaryButtonClass } from "@/components/ui";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { localDayKey, weekRange } from "@/lib/calendar";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { listPosts } from "@/lib/publishing/posts";
import { requireUserId } from "@/lib/users";

const statusStyle: Record<string, string> = {
  published: "border-l-green-500",
  partial: "border-l-amber-500",
  failed: "border-l-red-500",
  pending_approval: "border-l-amber-400 border-dashed",
  scheduled: "border-l-sky-500",
  publishing: "border-l-sky-500",
};
const statusLabel: Record<string, string> = { pending_approval: "Needs approval", scheduled: "Scheduled", publishing: "Publishing", published: "Published", partial: "Partly published", failed: "Failed" };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { week } = await searchParams;
  const settings = await getAutopilotSettings(userId);
  const tz = settings.timezone;
  const range = weekRange(week, tz);
  const posts = await listPosts(userId, {
    statuses: ["pending_approval", "scheduled", "publishing", "published", "partial", "failed"],
    from: range.start,
    to: range.end,
    limit: 200,
  });
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
  const byDay = new Map<string, typeof posts>();
  for (const p of posts) {
    const at = p.publishedAt ?? p.scheduledAt;
    if (!at) continue;
    const key = localDayKey(new Date(at), tz);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  for (const list of byDay.values()) list.sort((a, b) => +new Date(a.publishedAt ?? a.scheduledAt!) - +new Date(b.publishedAt ?? b.scheduledAt!));
  const slotsByDay = (i: number) => settings.enabled ? settings.slots.filter((s) => s.day === (i + 1) % 7).map((s) => s.time) : [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <PageHeader title="Calendar">Your week at a glance, in {tz}. Dashed cards are waiting for your approval.</PageHeader>
        <div className="ml-auto flex items-center gap-2">
          <Link className={buttonClass} href={`/dashboard/calendar?week=${range.prev}`} aria-label="Previous week">←</Link>
          <Link className={buttonClass} href="/dashboard/calendar">This week</Link>
          <Link className={buttonClass} href={`/dashboard/calendar?week=${range.next}`} aria-label="Next week">→</Link>
          <Link className={primaryButtonClass} href="/dashboard/compose">New post</Link>
        </div>
      </div>
      <p className="-mt-3 text-sm font-medium">{range.title}</p>

      <div className="grid gap-3 md:grid-cols-7">
        {range.days.map((d, i) => {
          const list = byDay.get(d.key) ?? [];
          const isToday = d.key === range.today;
          const empty = slotsByDay(i);
          return (
            <section key={d.key} className={`flex min-h-40 flex-col gap-2 rounded-2xl border bg-card p-2.5 ${isToday ? "border-accent ring-1 ring-accent/30" : "border-border"}`}>
              <h2 className="flex items-baseline gap-1.5 px-1 text-sm">
                <span className="font-semibold">{d.label}</span>
                <span className={isToday ? "bg-brand grid size-6 place-items-center rounded-full text-xs font-bold text-white" : "text-muted"}>{d.date}</span>
              </h2>
              {list.map((p) => (
                <Link
                  key={p.id}
                  href={`/dashboard/posts?tab=${p.status === "pending_approval" ? "approval" : p.status === "failed" ? "failed" : "all"}`}
                  className={`flex flex-col gap-1 rounded-lg border border-border border-l-4 bg-background p-2 text-xs hover:border-accent/50 ${statusStyle[p.status] ?? ""}`}
                >
                  <span className="flex items-center gap-1">
                    <span className="font-semibold tabular-nums">{time.format(new Date(p.publishedAt ?? p.scheduledAt!))}</span>
                    <span className="ml-auto flex gap-0.5">
                      {[...new Set(p.targets.map((t) => t.platform as PlatformId))].map((pl) => (
                        <span key={pl} title={PLATFORMS[pl]?.name} className="size-2 rounded-full" style={{ background: PLATFORMS[pl]?.color }} />
                      ))}
                    </span>
                  </span>
                  <span className="line-clamp-3">{p.body || "(media only)"}</span>
                  <span className="text-muted">{statusLabel[p.status] ?? p.status}{p.source === "autopilot" ? " · autopilot" : p.source === "agent" ? " · your agent" : ""}</span>
                </Link>
              ))}
              {list.length === 0 && empty.length > 0 && (
                <p className="rounded-lg border border-dashed border-border p-2 text-xs text-muted">Autopilot slot{empty.length > 1 ? "s" : ""} {empty.join(", ")}</p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
