import Link from "next/link";
import { redirect } from "next/navigation";
import { buttonClass, primaryButtonClass, StatCard } from "@/components/ui";
import { setupSteps } from "@/lib/onboarding";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { listPosts } from "@/lib/publishing/posts";
import { getPostStats } from "@/lib/publishing/stats";
import { requireUserId } from "@/lib/users";
import { PostList } from "./post-list";

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const [accounts, stats, settings, upcoming, problems] = await Promise.all([
    listConnectedAccounts(userId),
    getPostStats(userId),
    getAutopilotSettings(userId),
    listPosts(userId, { statuses: ["pending_approval", "scheduled", "publishing"], limit: 5 }),
    listPosts(userId, { statuses: ["failed", "partial"], from: daysAgo(7), limit: 3 }),
  ]);
  const unhealthy = accounts.filter((a) => a.status !== "active");
  const steps = setupSteps({
    accounts: accounts.length,
    brandVoice: settings.brandVoice,
    posts: stats.total,
    slots: settings.slots.length,
    autopilotOn: settings.enabled,
  });
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  const stuck = problems.flatMap((p) => p.targets.filter((t) => t.status === "failed").map((t) => ({ post: p, target: t })));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-muted">Here&apos;s what&apos;s going out and what needs you.</p>
        </div>
        <Link href="/dashboard/calendar" className={`ml-auto ${buttonClass}`}>Calendar</Link>
        <Link href="/dashboard/compose" className={primaryButtonClass}>✦ Create with AI</Link>
      </div>

      {next && (
        <section className="overflow-hidden rounded-2xl border border-accent/40 bg-card">
          <div className="bg-gradient-to-br from-accent/15 via-accent-2/10 to-transparent p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-semibold">Get set up</h2>
              <span className="text-sm text-muted">{doneCount} of {steps.length} done</span>
              <div className="h-2 w-full overflow-hidden rounded-full bg-border sm:ml-auto sm:w-48">
                <div className="bg-brand h-full rounded-full" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
              </div>
            </div>
            <ol className="mt-4 flex flex-col gap-2">
              {steps.map((st, i) => (
                <li key={st.id} className={`flex items-center gap-3 rounded-xl p-2.5 ${st === next ? "bg-background ring-1 ring-border" : ""}`}>
                  <span className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${st.done ? "bg-green-600 text-white" : st === next ? "bg-brand text-white" : "border border-border text-muted"}`}>
                    {st.done ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${st.done ? "text-muted line-through" : ""}`}>{st.title}</p>
                    {st === next && <p className="text-xs text-muted">{st.detail}</p>}
                  </div>
                  {st === next && <Link href={st.href} className={primaryButtonClass}>{st.cta}</Link>}
                </li>
              ))}
            </ol>
          </div>
        </section>
      )}

      {stuck.length > 0 && (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm">
          <p className="font-semibold">{stuck.length} post{stuck.length > 1 ? "s" : ""} didn&apos;t go out this week</p>
          <ul className="mt-2 flex flex-col gap-1">
            {stuck.slice(0, 3).map(({ post, target }) => (
              <li key={target.id} className="flex flex-wrap gap-x-2">
                <span className="font-medium">{PLATFORMS[target.platform as PlatformId]?.name ?? target.platform}:</span>
                <span className="text-muted">{target.lastError ?? "Unknown error"}</span>
                <span className="truncate text-muted">“{post.body.slice(0, 60)}{post.body.length > 60 ? "…" : ""}”</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/posts?tab=failed" className="mt-2 inline-block font-medium underline">Review and retry</Link>
        </div>
      )}

      {unhealthy.length > 0 && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {unhealthy.length} account(s) need attention and won&apos;t receive posts until reconnected.{" "}
          <Link href="/dashboard/monitor" className="underline">See details</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard title="Scheduled" value={stats.scheduled} href="/dashboard/posts?tab=scheduled" />
        <StatCard title="Needs approval" value={stats.pendingApproval} href="/dashboard/posts?tab=approval" />
        <StatCard title="Published (7 days)" value={stats.publishedWeek} href="/dashboard/monitor" />
        <StatCard title="Failed (7 days)" value={stats.failedWeek} href="/dashboard/posts?tab=failed" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <span className="font-medium">Autopilot is {settings.enabled ? "on" : "off"}.</span>{" "}
        {settings.enabled
          ? `${settings.slots.length} posting time(s) a week, ${settings.requireApproval ? "drafts wait for your approval" : "drafts are scheduled automatically"}.`
          : "Turn it on to have AI draft and schedule posts for your weekly posting times."}{" "}
        <Link href="/dashboard/autopilot" className="text-accent underline">Autopilot settings</Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Coming up</h2>
        <PostList
          posts={upcoming}
          timeZone={settings.timezone}
          empty={
            accounts.length === 0 ? (
              <>Start by <Link className="text-accent underline" href="/dashboard/accounts">connecting a social account</Link>.</>
            ) : (
              <>Nothing scheduled. <Link className="text-accent underline" href="/dashboard/compose">Write a post</Link> or turn on autopilot.</>
            )
          }
        />
      </section>
    </div>
  );
}
