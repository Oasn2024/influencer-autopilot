import "server-only";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { activityEvents, connectedAccounts, posts, postTargets } from "@/db/schema";

/** Counts for the overview and monitor pages. */
export async function getPostStats(userId: string) {
  const db = getDb();
  const rows = await db
    .select({ status: posts.status, n: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.userId, userId))
    .groupBy(posts.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [week] = await db
    .select({
      published: sql<number>`count(*) filter (where ${postTargets.status} = 'published')::int`,
      failed: sql<number>`count(*) filter (where ${postTargets.status} = 'failed')::int`,
    })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(posts.userId, userId), gte(postTargets.updatedAt, weekAgo)));
  return {
    scheduled: (by.scheduled ?? 0) + (by.publishing ?? 0),
    pendingApproval: by.pending_approval ?? 0,
    drafts: by.draft ?? 0,
    publishedWeek: week?.published ?? 0,
    failedWeek: week?.failed ?? 0,
  };
}

/** Per-account health: status plus recent success/failure counts. */
export async function getAccountHealth(userId: string) {
  const db = getDb();
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  return db
    .select({
      id: connectedAccounts.id,
      platform: connectedAccounts.platform,
      displayName: connectedAccounts.displayName,
      handle: connectedAccounts.handle,
      status: connectedAccounts.status,
      lastError: connectedAccounts.lastError,
      tokenExpiresAt: connectedAccounts.tokenExpiresAt,
      published: sql<number>`count(${postTargets.id}) filter (where ${postTargets.status} = 'published')::int`,
      failed: sql<number>`count(${postTargets.id}) filter (where ${postTargets.status} = 'failed')::int`,
      lastPublishedAt: sql<Date | null>`max(${postTargets.publishedAt})`,
    })
    .from(connectedAccounts)
    .leftJoin(postTargets, and(eq(postTargets.connectedAccountId, connectedAccounts.id), gte(postTargets.updatedAt, monthAgo)))
    .where(eq(connectedAccounts.userId, userId))
    .groupBy(connectedAccounts.id)
    .orderBy(connectedAccounts.createdAt);
}

export async function listActivity(userId: string, opts: { level?: "info" | "warning" | "error"; limit?: number } = {}) {
  const where = opts.level ? and(eq(activityEvents.userId, userId), eq(activityEvents.level, opts.level)) : eq(activityEvents.userId, userId);
  return getDb()
    .select()
    .from(activityEvents)
    .where(where)
    .orderBy(desc(activityEvents.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}
