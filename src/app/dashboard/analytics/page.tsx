import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, PlatformChip, StatCard } from "@/components/ui";
import { listMetricRows, METRICS_PLATFORMS } from "@/lib/analytics";
import { engagementOf, formatLearnedTime, learnBestTimes, MIN_POSTS_FOR_LEARNING, summarize } from "@/lib/analytics/insights";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { PLATFORMS } from "@/lib/platforms";
import { requireUserId } from "@/lib/users";
import { RefreshStatsButton, UseLearnedTimesButton } from "./buttons";

const RANGES = [7, 30, 90] as const;
const n = (x: number) => new Intl.NumberFormat("en-US", { notation: x >= 10_000 ? "compact" : "standard" }).format(x);

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { days: d } = await searchParams;
  const days = RANGES.find((r) => String(r) === d) ?? 30;
  const [rows, settings, accounts] = await Promise.all([listMetricRows(userId, days), getAutopilotSettings(userId), listConnectedAccounts(userId)]);
  const s = summarize(rows);
  const learned = learnBestTimes(await listMetricRows(userId, 60), settings.timezone);
  const maxEng = Math.max(1, ...s.platforms.map((p) => p.engagement));
  const errors = rows.filter((r) => r.metrics?.error);
  const noStats = [...new Set(accounts.map((a) => a.platform))].filter((p) => !METRICS_PLATFORMS.includes(p));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <PageHeader title="Analytics">How your posts are doing, read back from each platform every few hours.</PageHeader>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-border text-sm">
            {RANGES.map((r) => (
              <Link key={r} href={`/dashboard/analytics?days=${r}`} className={`px-3 py-1.5 ${r === days ? "bg-accent text-white" : "hover:bg-card"}`}>
                {r} days
              </Link>
            ))}
          </div>
          <RefreshStatsButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard title="Posts published" value={s.published} note={`${s.measured} with stats`} />
        <StatCard title="Interactions" value={n(s.totals.engagement)} note="likes + comments + shares" />
        <StatCard title="Per post" value={s.measured ? n(Math.round((s.totals.engagement / s.measured) * 10) / 10) : "–"} note="average interactions" />
        <StatCard title="Views" value={s.totals.views ? n(s.totals.views) : "–"} note="where the platform shares them" />
      </div>

      {s.published === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted">
          Nothing published in the last {days} days. <Link href="/dashboard/compose" className="text-accent underline">Create a post</Link> and its stats will show up here a few hours after it goes out.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">By platform</h2>
            <ul className="mt-4 flex flex-col gap-4">
              {s.platforms.map((p) => (
                <li key={p.platform} className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-sm">
                    <PlatformChip name={PLATFORMS[p.platform].name} color={PLATFORMS[p.platform].color} />
                    <span className="text-muted">{p.posts} post{p.posts === 1 ? "" : "s"} · {p.avgEngagement} per post</span>
                    <span className="ml-auto font-semibold tabular-nums">{n(p.engagement)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-border">
                    <div className="h-full rounded-full" style={{ width: `${(p.engagement / maxEng) * 100}%`, background: PLATFORMS[p.platform].color }} />
                  </div>
                  <p className="text-xs text-muted">
                    {n(p.likes)} likes · {n(p.comments)} comments · {n(p.shares)} shares{p.views ? ` · ${n(p.views)} views` : ""}
                  </p>
                </li>
              ))}
              {s.platforms.length === 0 && <li className="text-sm text-muted">Stats arrive about an hour after a post goes out.</li>}
            </ul>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold">Your best times</h2>
            {learned?.length ? (
              <>
                <p className="mt-1 text-sm text-muted">When your posts beat your usual results, in {settings.timezone}. Based on the last 60 days.</p>
                <ul className="mt-4 flex flex-col gap-2">
                  {learned.map((t) => (
                    <li key={`${t.day}-${t.hour}`} className="flex items-center gap-3 text-sm">
                      <span className="w-20 font-semibold">{formatLearnedTime(t)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-border">
                        <div className="bg-brand h-full rounded-full" style={{ width: `${Math.min(100, (t.lift / learned[0].lift) * 100)}%` }} />
                      </div>
                      <span className="w-28 text-right text-xs text-muted">{t.lift}× usual · {t.posts} posts</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4"><UseLearnedTimesButton /></div>
              </>
            ) : learned ? (
              <p className="mt-2 text-sm text-muted">No time of day stands out yet. Keep posting at a few different times and check back.</p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                After {MIN_POSTS_FOR_LEARNING} posts with stats, this learns when your audience responds most and can set autopilot&apos;s times for you. Until then, autopilot can use{" "}
                <Link href="/dashboard/autopilot" className="text-accent underline">suggested times</Link>.
              </p>
            )}
          </section>
        </div>
      )}

      {s.top.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-semibold">Top posts</h2>
          <ol className="flex flex-col gap-2">
            {s.top.map((r, i) => (
              <li key={r.targetId} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
                <span className="bg-brand grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <PlatformChip name={PLATFORMS[r.platform].name} color={PLATFORMS[r.platform].color} />
                    <span className="text-muted">{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: settings.timezone }).format(r.publishedAt)}</span>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer" className="text-accent underline">View</a>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm">{r.body || "(media only)"}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-lg font-semibold tabular-nums">{n(engagementOf(r.metrics))}</p>
                  <p className="text-xs text-muted">{n(r.metrics?.likes ?? 0)} ♥ · {n(r.metrics?.comments ?? 0)} 💬</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {(errors.length > 0 || noStats.length > 0) && (
        <section className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          {noStats.length > 0 && (
            <p>{noStats.map((p) => PLATFORMS[p].name).join(", ")} {noStats.length > 1 ? "don't" : "doesn't"} let apps read post stats yet, so those posts aren&apos;t counted here.</p>
          )}
          {errors.length > 0 && (
            <p className={noStats.length ? "mt-2" : ""}>
              Stats couldn&apos;t be read for {errors.length} post(s): {errors[0].metrics!.error}. Reconnecting the account on the{" "}
              <Link href="/dashboard/accounts" className="underline">Accounts page</Link> usually fixes this.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
