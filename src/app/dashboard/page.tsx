import Link from "next/link";
import { redirect } from "next/navigation";
import { StatCard } from "@/components/ui";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { listPosts } from "@/lib/publishing/posts";
import { getPostStats } from "@/lib/publishing/stats";
import { requireUserId } from "@/lib/users";
import { PostList } from "./post-list";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const [accounts, stats, settings, upcoming] = await Promise.all([
    listConnectedAccounts(userId),
    getPostStats(userId),
    getAutopilotSettings(userId),
    listPosts(userId, { statuses: ["pending_approval", "scheduled", "publishing"], limit: 5 }),
  ]);
  const unhealthy = accounts.filter((a) => a.status !== "active");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <Link href="/dashboard/compose" className="ml-auto rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white">New post</Link>
      </div>

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

      <div className="rounded-xl border border-border bg-card p-4 text-sm">
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
