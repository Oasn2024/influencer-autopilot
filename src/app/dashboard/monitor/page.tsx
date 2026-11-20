import Link from "next/link";
import { redirect } from "next/navigation";
import { Badge, PageHeader, StatCard, formatWhen } from "@/components/ui";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { PLATFORMS } from "@/lib/platforms";
import { getAccountHealth, getPostStats, listActivity } from "@/lib/publishing/stats";
import { requireUserId } from "@/lib/users";

const LEVELS = ["all", "error", "warning", "info"] as const;

export default async function MonitorPage({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { level: levelParam } = await searchParams;
  const level = LEVELS.find((l) => l === levelParam) ?? "all";
  const [stats, health, events, settings] = await Promise.all([
    getPostStats(userId),
    getAccountHealth(userId),
    listActivity(userId, { level: level === "all" ? undefined : level, limit: 150 }),
    getAutopilotSettings(userId),
  ]);
  const tz = settings.timezone;
  const total = stats.publishedWeek + stats.failedWeek;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Monitor">How posting is going on each account, and everything the autopilot did.</PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Published (7 days)" value={stats.publishedWeek} />
        <StatCard title="Failed (7 days)" value={stats.failedWeek} href="/dashboard/posts?tab=failed" />
        <StatCard title="Success rate" value={total ? `${Math.round((stats.publishedWeek / total) * 100)}%` : "–"} />
        <StatCard title="Autopilot" value={settings.enabled ? "On" : "Off"} note={settings.lastRunAt ? `Last run ${formatWhen(settings.lastRunAt, tz)}` : "Not run yet"} href="/dashboard/autopilot" />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Account health (30 days)</h2>
        {health.length === 0 ? (
          <p className="text-sm text-muted"><Link href="/dashboard/accounts" className="text-accent underline">Connect an account</Link> to start.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-card text-left text-muted">
                <tr><th className="p-3">Account</th><th className="p-3">Status</th><th className="p-3">Published</th><th className="p-3">Failed</th><th className="p-3">Last post</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {health.map((a) => (
                  <tr key={a.id}>
                    <td className="p-3">
                      <span className="font-medium">{PLATFORMS[a.platform].name}</span> <span className="text-muted">{a.displayName ?? a.handle}</span>
                      {a.status !== "active" && a.lastError && <p className="text-xs text-red-600 dark:text-red-400">{a.lastError}</p>}
                    </td>
                    <td className="p-3">
                      <Badge status={a.status} />
                      {a.status !== "active" && <Link href="/dashboard/accounts" className="ml-2 text-xs text-accent underline">Reconnect</Link>}
                    </td>
                    <td className="p-3">{a.published}</td>
                    <td className="p-3">{a.failed}</td>
                    <td className="p-3 text-muted">{a.lastPublishedAt ? formatWhen(a.lastPublishedAt, tz) : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 font-semibold">Activity log</h2>
          {LEVELS.map((l) => (
            <Link key={l} href={`/dashboard/monitor?level=${l}`} className={`rounded-full px-3 py-0.5 text-xs ${l === level ? "bg-accent text-white" : "border border-border"}`}>{l}</Link>
          ))}
        </div>
        {events.length === 0 ? (
          <p className="text-sm text-muted">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-start sm:gap-3">
                <span className="shrink-0 text-xs text-muted sm:w-40">{formatWhen(e.createdAt, tz)}</span>
                <span className="shrink-0"><Badge status={e.level} /></span>
                <span className="min-w-0 break-words">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
