import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, posts, postTargets, type Post, type PostTarget } from "@/db/schema";
import { captionFor, validateForPlatform, type ValidationIssue } from "@/lib/publishers/validation";
import { logEvent } from "./events";

export class PostValidationError extends Error {
  constructor(readonly issues: ValidationIssue[] | string[]) {
    super(issues.map((i) => (typeof i === "string" ? i : `${i.platform}: ${i.message}`)).join("; "));
    this.name = "PostValidationError";
  }
}

export type CreatePostInput = {
  body: string;
  mediaUrls?: string[];
  accountIds: string[];
  /** Per-account caption overrides, keyed by connected account id. */
  overrides?: Record<string, string>;
  /** When to publish. Omit for a draft; a past/now time publishes on the next run. */
  scheduledAt?: Date | null;
  status?: "draft" | "pending_approval" | "scheduled";
  source?: "manual" | "api" | "autopilot";
  generation?: Record<string, unknown> | null;
};

export type PostWithTargets = Post & {
  targets: (PostTarget & { platform: string; accountName: string | null })[];
};

export async function createPost(userId: string, input: CreatePostInput): Promise<PostWithTargets> {
  const db = getDb();
  const accountIds = [...new Set(input.accountIds)];
  if (accountIds.length === 0) throw new PostValidationError(["Choose at least one account"]);
  const accounts = await db
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform, status: connectedAccounts.status })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, userId), inArray(connectedAccounts.id, accountIds)));
  if (accounts.length !== accountIds.length) throw new PostValidationError(["One or more accounts were not found"]);

  const mediaUrls = (input.mediaUrls ?? []).map((u) => u.trim()).filter(Boolean);
  const issues = accounts.flatMap((a) =>
    validateForPlatform(a.platform, { text: captionFor(input.body, input.overrides?.[a.id]), mediaUrls }),
  );
  const status = input.status ?? (input.scheduledAt ? "scheduled" : "draft");
  if (issues.length && status !== "draft") throw new PostValidationError(issues);

  const post = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(posts)
      .values({
        userId,
        body: input.body,
        mediaUrls,
        status,
        source: input.source ?? "manual",
        scheduledAt: input.scheduledAt ?? null,
        generation: input.generation ?? null,
      })
      .returning();
    await tx.insert(postTargets).values(
      accounts.map((a) => ({ postId: p.id, connectedAccountId: a.id, bodyOverride: input.overrides?.[a.id]?.trim() || null })),
    );
    return p;
  });
  await logEvent({
    userId,
    postId: post.id,
    type: "post.created",
    message: `${input.source === "autopilot" ? "Autopilot drafted" : "Created"} a post for ${accounts.length} account(s)${
      post.scheduledAt ? `, scheduled for ${post.scheduledAt.toISOString()}` : ""
    }`,
  });
  return (await getPost(userId, post.id))!;
}

export async function getPost(userId: string, postId: string): Promise<PostWithTargets | null> {
  const db = getDb();
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!post) return null;
  const targets = await db
    .select({ target: postTargets, platform: connectedAccounts.platform, accountName: connectedAccounts.displayName })
    .from(postTargets)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postTargets.connectedAccountId))
    .where(eq(postTargets.postId, postId));
  return { ...post, targets: targets.map((t) => ({ ...t.target, platform: t.platform, accountName: t.accountName })) };
}

export async function listPosts(userId: string, opts: { statuses?: Post["status"][]; limit?: number; from?: Date; to?: Date } = {}) {
  const db = getDb();
  const when = sql`coalesce(${posts.publishedAt}, ${posts.scheduledAt})`;
  const where = and(
    eq(posts.userId, userId),
    opts.statuses?.length ? inArray(posts.status, opts.statuses) : undefined,
    opts.from ? sql`${when} >= ${opts.from.toISOString()}::timestamptz` : undefined,
    opts.to ? sql`${when} < ${opts.to.toISOString()}::timestamptz` : undefined,
  );
  const rows = await db
    .select()
    .from(posts)
    .where(where)
    .orderBy(sql`coalesce(${posts.scheduledAt}, ${posts.createdAt}) desc`)
    .limit(Math.min(opts.limit ?? 50, 200));
  if (rows.length === 0) return [];
  const targets = await db
    .select({ target: postTargets, platform: connectedAccounts.platform, accountName: connectedAccounts.displayName })
    .from(postTargets)
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postTargets.connectedAccountId))
    .where(inArray(postTargets.postId, rows.map((r) => r.id)));
  return rows.map((p) => ({
    ...p,
    targets: targets.filter((t) => t.target.postId === p.id).map((t) => ({ ...t.target, platform: t.platform, accountName: t.accountName })),
  }));
}

/** Moves a draft or pending post onto the schedule (now if its time has passed). */
export async function schedulePost(userId: string, postId: string, at?: Date | null) {
  const post = await getPost(userId, postId);
  if (!post) return null;
  if (!["draft", "pending_approval", "scheduled", "failed", "partial"].includes(post.status)) return post;
  const when = at ?? post.scheduledAt ?? new Date();
  const scheduledAt = when.getTime() < Date.now() ? new Date() : when;
  await getDb().update(posts).set({ status: "scheduled", scheduledAt, updatedAt: sql`now()` }).where(eq(posts.id, postId));
  await logEvent({ userId, postId, type: "post.scheduled", message: `Scheduled for ${scheduledAt.toISOString()}` });
  return getPost(userId, postId);
}

export async function cancelPost(userId: string, postId: string) {
  const db = getDb();
  const updated = await db
    .update(posts)
    .set({ status: "canceled", updatedAt: sql`now()` })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId), inArray(posts.status, ["draft", "pending_approval", "scheduled", "failed", "partial"])))
    .returning({ id: posts.id });
  if (!updated.length) return false;
  await db
    .update(postTargets)
    .set({ status: "skipped", nextAttemptAt: null, updatedAt: sql`now()` })
    .where(and(eq(postTargets.postId, postId), inArray(postTargets.status, ["pending", "failed"])));
  await logEvent({ userId, postId, type: "post.canceled", message: "Post canceled" });
  return true;
}

/** Manual retry of one failed account: queue it to publish on the next run. */
export async function retryTarget(userId: string, targetId: string) {
  const db = getDb();
  const [row] = await db
    .select({ target: postTargets, post: posts })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .where(and(eq(postTargets.id, targetId), eq(posts.userId, userId)))
    .limit(1);
  if (!row || row.target.status !== "failed") return null;
  await db
    .update(postTargets)
    .set({ status: "pending", attempts: 0, nextAttemptAt: null, lastError: null, updatedAt: sql`now()` })
    .where(eq(postTargets.id, targetId));
  await db.update(posts).set({ status: "scheduled", scheduledAt: sql`least(coalesce(${posts.scheduledAt}, now()), now())`, updatedAt: sql`now()` }).where(eq(posts.id, row.post.id));
  await logEvent({ userId, postId: row.post.id, postTargetId: targetId, type: "target.retry", message: "Retry requested" });
  return row.post.id;
}
