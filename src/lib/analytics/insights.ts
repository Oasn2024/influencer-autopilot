import type { AutopilotSlot, TargetMetrics } from "@/db/schema";
import type { PlatformId } from "@/lib/platforms";

/** Interactions on a post: likes + comments + shares (views aren't interactions). */
export const engagementOf = (m: TargetMetrics | null | undefined) => (m ? (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) : 0);

export type MetricRow = {
  targetId: string;
  postId: string;
  accountId: string;
  platform: PlatformId;
  body: string;
  url: string | null;
  publishedAt: Date;
  metrics: TargetMetrics | null;
};

export type PlatformSummary = { platform: PlatformId; posts: number; likes: number; comments: number; shares: number; views: number; engagement: number; avgEngagement: number };

export function summarize(rows: MetricRow[]) {
  const measured = rows.filter((r) => r.metrics && !r.metrics.error);
  const byPlatform = new Map<PlatformId, PlatformSummary>();
  for (const r of measured) {
    const s = byPlatform.get(r.platform) ?? { platform: r.platform, posts: 0, likes: 0, comments: 0, shares: 0, views: 0, engagement: 0, avgEngagement: 0 };
    s.posts++;
    s.likes += r.metrics!.likes ?? 0;
    s.comments += r.metrics!.comments ?? 0;
    s.shares += r.metrics!.shares ?? 0;
    s.views += r.metrics!.views ?? 0;
    s.engagement += engagementOf(r.metrics);
    byPlatform.set(r.platform, s);
  }
  const platforms = [...byPlatform.values()].map((s) => ({ ...s, avgEngagement: s.posts ? Math.round((s.engagement / s.posts) * 10) / 10 : 0 }));
  platforms.sort((a, b) => b.engagement - a.engagement);
  const totals = platforms.reduce(
    (t, s) => ({ posts: t.posts + s.posts, likes: t.likes + s.likes, comments: t.comments + s.comments, shares: t.shares + s.shares, views: t.views + s.views, engagement: t.engagement + s.engagement }),
    { posts: 0, likes: 0, comments: 0, shares: 0, views: 0, engagement: 0 },
  );
  const top = [...measured].sort((a, b) => engagementOf(b.metrics) - engagementOf(a.metrics)).slice(0, 5);
  return { totals, platforms, top, published: rows.length, measured: measured.length };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function localDayHour(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return {
    day: WEEKDAYS.indexOf(parts.find((p) => p.type === "weekday")!.value),
    hour: Number(parts.find((p) => p.type === "hour")!.value),
  };
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export const MIN_POSTS_FOR_LEARNING = 8;

export type LearnedTime = { day: number; hour: number; lift: number; posts: number };

/**
 * Finds the weekday + hour slots where your posts do best. Each post is compared with the
 * typical post on the same account (so a big LinkedIn audience doesn't drown out X),
 * then slots are ranked by how far above typical they land. Needs a few posts per slot.
 */
export function learnBestTimes(rows: MetricRow[], timeZone: string, opts: { minPerSlot?: number; max?: number } = {}): LearnedTime[] | null {
  const measured = rows.filter((r) => r.metrics && !r.metrics.error);
  if (measured.length < MIN_POSTS_FOR_LEARNING) return null;
  const byAccount = new Map<string, number[]>();
  for (const r of measured) byAccount.set(r.accountId, [...(byAccount.get(r.accountId) ?? []), engagementOf(r.metrics)]);
  const typical = new Map([...byAccount].map(([id, xs]) => [id, Math.max(median(xs), 1)]));
  const slots = new Map<string, { day: number; hour: number; scores: number[] }>();
  for (const r of measured) {
    const { day, hour } = localDayHour(r.publishedAt, timeZone);
    const key = `${day}-${hour}`;
    const s = slots.get(key) ?? { day, hour, scores: [] };
    s.scores.push(engagementOf(r.metrics) / typical.get(r.accountId)!);
    slots.set(key, s);
  }
  return [...slots.values()]
    .filter((s) => s.scores.length >= (opts.minPerSlot ?? 2))
    .map((s) => ({ day: s.day, hour: s.hour, posts: s.scores.length, lift: Math.round((s.scores.reduce((a, b) => a + b, 0) / s.scores.length) * 100) / 100 }))
    .filter((s) => s.lift >= 1)
    .sort((a, b) => b.lift - a.lift || b.posts - a.posts)
    .slice(0, opts.max ?? 5);
}

export const toSlots = (times: LearnedTime[]): AutopilotSlot[] =>
  times.map((t) => ({ day: t.day, time: `${String(t.hour).padStart(2, "0")}:00` })).sort((a, b) => a.day - b.day || a.time.localeCompare(b.time));

export const formatLearnedTime = (t: LearnedTime) => {
  const h = t.hour % 12 || 12;
  return `${WEEKDAYS[t.day]} ${h}${t.hour < 12 ? "am" : "pm"}`;
};
