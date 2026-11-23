import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, posts, postTargets, type TargetMetrics } from "@/db/schema";
import { getPublisher, PublishError } from "@/lib/publishers";
import { freshAccessToken } from "@/lib/publishing/engine";
import type { PlatformId } from "@/lib/platforms";
import type { MetricRow } from "./insights";

/** Platforms whose API lets us read post engagement with the permissions we ask for. */
export const METRICS_PLATFORMS: PlatformId[] = ["x", "threads", "facebook", "instagram", "youtube", "tiktok"];

/**
 * Reads fresh engagement numbers for recently published posts. New posts (under 2 days)
 * refresh every 3 hours, older ones daily, up to 30 days after publishing.
 */
export async function refreshMetrics(opts: { limit?: number; userId?: string } = {}) {
  const db = getDb();
  const due = await db
    .select({ target: postTargets, account: connectedAccounts })
    .from(postTargets)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postTargets.connectedAccountId))
    .where(
      and(
        eq(postTargets.status, "published"),
        isNotNull(postTargets.externalPostId),
        eq(connectedAccounts.status, "active"),
        inArray(connectedAccounts.platform, METRICS_PLATFORMS),
        opts.userId ? eq(connectedAccounts.userId, opts.userId) : undefined,
        sql`${postTargets.publishedAt} > now() - interval '30 days'`,
        sql`${postTargets.publishedAt} < now() - interval '1 hour'`,
        sql`(${postTargets.metricsUpdatedAt} is null
          or (${postTargets.publishedAt} > now() - interval '2 days' and ${postTargets.metricsUpdatedAt} < now() - interval '3 hours')
          or ${postTargets.metricsUpdatedAt} < now() - interval '24 hours')`,
      ),
    )
    .orderBy(sql`${postTargets.metricsUpdatedAt} asc nulls first`)
    .limit(opts.limit ?? 40);

  let updated = 0;
  let failed = 0;
  for (const { target, account } of due) {
    const publisher = getPublisher(account.platform);
    if (!publisher?.metrics) continue;
    let metrics: TargetMetrics;
    try {
      const token = await freshAccessToken(account, publisher);
      metrics = await publisher.metrics({ externalAccountId: account.externalAccountId, handle: account.handle, metadata: account.metadata }, token, target.externalPostId!);
      updated++;
    } catch (err) {
      failed++;
      // Keep the last good numbers; note why this read failed (often a missing insights permission).
      const message = err instanceof PublishError || err instanceof Error ? err.message : "Couldn't read stats";
      metrics = { ...(target.metrics ?? {}), error: message.slice(0, 300) };
    }
    await db.update(postTargets).set({ metrics, metricsUpdatedAt: sql`now()` }).where(eq(postTargets.id, target.id));
  }
  return { checked: due.length, updated, failed };
}

/** Published targets for one user in the last `days` days, with their latest metrics. */
export async function listMetricRows(userId: string, days = 30): Promise<MetricRow[]> {
  const rows = await getDb()
    .select({
      targetId: postTargets.id,
      postId: posts.id,
      accountId: connectedAccounts.id,
      platform: connectedAccounts.platform,
      body: posts.body,
      override: postTargets.bodyOverride,
      url: postTargets.externalPostUrl,
      publishedAt: postTargets.publishedAt,
      metrics: postTargets.metrics,
    })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postTargets.connectedAccountId))
    .where(and(eq(posts.userId, userId), eq(postTargets.status, "published"), gte(postTargets.publishedAt, new Date(Date.now() - days * 86_400_000))))
    .orderBy(desc(postTargets.publishedAt))
    .limit(1000);
  return rows.map((r) => ({ ...r, body: r.override?.trim() ? r.override : r.body, publishedAt: r.publishedAt! }));
}
