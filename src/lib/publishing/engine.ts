import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, posts, postTargets, type ConnectedAccount} from "@/db/schema";
import { openTokens } from "@/lib/connected-accounts/sealing";
import { setAccountStatus, updateAccountTokens } from "@/lib/connected-accounts";
import { getPublisher, PublishError } from "@/lib/publishers";
import { retryDelayMs, rollupPostStatus } from "@/lib/publishers/status";
import { captionFor, validateForPlatform } from "@/lib/publishers/validation";
import { PLATFORMS } from "@/lib/platforms";
import { logEvent } from "./events";

/**
 * Atomically claims due targets so overlapping cron runs never publish the same
 * thing twice (FOR UPDATE SKIP LOCKED). Claimed rows move to "publishing".
 */
async function claimDueTargets(limit: number, postId?: string): Promise<string[]> {
  const db = getDb();
  const postFilter = postId ? sql`and p.id = ${postId}` : sql``;
  const rows = await db.execute<{ id: string }>(sql`
    update post_targets set status = 'publishing', attempts = attempts + 1, updated_at = now()
    where id in (
      select t.id from post_targets t
      join posts p on p.id = t.post_id
      where p.status in ('scheduled', 'publishing', 'partial')
        and p.scheduled_at is not null and p.scheduled_at <= now()
        ${postFilter}
        and (
          t.status = 'pending'
          or (t.status = 'failed' and t.next_attempt_at is not null and t.next_attempt_at <= now())
          -- a target stuck in 'publishing' this long crashed mid-run
          or (t.status = 'publishing' and t.updated_at < now() - interval '10 minutes')
        )
      order by p.scheduled_at
      limit ${limit}
      for update of t skip locked
    )
    returning id`);
  return [...rows].map((r) => r.id);
}

function needsRefresh(account: ConnectedAccount): boolean {
  if (!account.tokenExpiresAt) return false;
  // Threads long-lived tokens last 60 days and can only be refreshed, not re-issued, so refresh early.
  const windowMs = account.platform === "threads" ? 7 * 24 * 3600_000 : 5 * 60_000;
  return account.tokenExpiresAt.getTime() - Date.now() < windowMs;
}

type TargetOutcome = { targetId: string; postId: string; status: "published" | "failed"; error?: string };

async function publishTarget(targetId: string): Promise<TargetOutcome | null> {
  const db = getDb();
  const [row] = await db
    .select({ target: postTargets, post: posts, account: connectedAccounts })
    .from(postTargets)
    .innerJoin(posts, eq(posts.id, postTargets.postId))
    .innerJoin(connectedAccounts, eq(connectedAccounts.id, postTargets.connectedAccountId))
    .where(eq(postTargets.id, targetId))
    .limit(1);
  if (!row) return null;
  const { target, post, account } = row;
  const platformName = PLATFORMS[account.platform].name;
  const base = { userId: post.userId, postId: post.id, postTargetId: target.id, connectedAccountId: account.id };

  const fail = async (message: string, opts: { retryable: boolean; auth?: boolean }) => {
    const delay = opts.retryable ? retryDelayMs(target.attempts) : null;
    await db
      .update(postTargets)
      .set({ status: "failed", lastError: message, nextAttemptAt: delay ? new Date(Date.now() + delay) : null, updatedAt: sql`now()` })
      .where(eq(postTargets.id, target.id));
    if (opts.auth) {
      await setAccountStatus(account.id, "expired", message);
      await logEvent({ ...base, level: "error", type: "account.expired", message: `${platformName} needs to be reconnected: ${message}` });
    }
    await logEvent({
      ...base,
      level: delay ? "warning" : "error",
      type: delay ? "target.retrying" : "target.failed",
      message: delay
        ? `${platformName} failed (attempt ${target.attempts}), retrying in ${Math.round(delay / 60_000)} min: ${message}`
        : `${platformName} failed: ${message}`,
    });
    return { targetId: target.id, postId: post.id, status: "failed" as const, error: message };
  };

  if (account.status !== "active") {
    return fail(`Account is ${account.status}; reconnect it on the Accounts page`, { retryable: false });
  }
  const publisher = getPublisher(account.platform);
  if (!publisher) return fail(`Publishing to ${platformName} isn't supported yet`, { retryable: false });

  const content = { text: captionFor(post.body, target.bodyOverride), mediaUrls: post.mediaUrls };
  const issues = validateForPlatform(account.platform, content);
  if (issues.length) return fail(issues.map((i) => i.message).join("; "), { retryable: false });

  try {
    let tokens = openTokens(account, account);
    if (publisher.refresh && needsRefresh(account)) {
      const fresh = await publisher.refresh(tokens);
      const refreshToken = fresh.refreshToken ?? tokens.refreshToken;
      await updateAccountTokens(account, { accessToken: fresh.accessToken, refreshToken, expiresAt: fresh.expiresAt ?? null });
      tokens = { accessToken: fresh.accessToken, refreshToken: refreshToken ?? "" };
      await logEvent({ ...base, type: "account.refreshed", message: `${platformName} token refreshed` });
    }
    const result = await publisher.publish(
      { externalAccountId: account.externalAccountId, handle: account.handle, metadata: account.metadata },
      tokens.accessToken,
      content,
    );
    await db
      .update(postTargets)
      .set({
        status: "published",
        externalPostId: result.externalPostId,
        externalPostUrl: result.url ?? null,
        publishedAt: sql`now()`,
        lastError: null,
        nextAttemptAt: null,
        updatedAt: sql`now()`,
      })
      .where(eq(postTargets.id, target.id));
    await logEvent({ ...base, type: "target.published", message: `Published to ${platformName}${result.url ? `: ${result.url}` : ""}` });
    return { targetId: target.id, postId: post.id, status: "published" };
  } catch (err) {
    if (err instanceof PublishError) return fail(err.message, { retryable: err.retryable, auth: err.auth });
    const message = err instanceof Error ? err.message : "Unknown error";
    return fail(message, { retryable: true });
  }
}

/** Recomputes a post's overall status from its targets. */
export async function refreshPostStatus(postId: string) {
  const db = getDb();
  const targets = await db
    .select({ status: postTargets.status, nextAttemptAt: postTargets.nextAttemptAt })
    .from(postTargets)
    .where(eq(postTargets.postId, postId));
  const status = rollupPostStatus(targets);
  const [post] = await db
    .update(posts)
    .set({
      status,
      publishedAt: status === "published" || status === "partial" ? sql`coalesce(${posts.publishedAt}, now())` : posts.publishedAt,
      updatedAt: sql`now()`,
    })
    .where(and(eq(posts.id, postId), inArray(posts.status, ["scheduled", "publishing", "partial", "failed"])))
    .returning({ userId: posts.userId });
  if (post && (status === "published" || status === "partial" || status === "failed")) {
    await logEvent({
      userId: post.userId,
      postId,
      level: status === "published" ? "info" : status === "partial" ? "warning" : "error",
      type: `post.${status}`,
      message:
        status === "published" ? "Post is live on every account" : status === "partial" ? "Post went out on some accounts, not all" : "Post failed on every account",
    });
  }
  return status;
}

export type CycleResult = { claimed: number; published: number; failed: number; outcomes: TargetOutcome[] };

/** One publishing pass: claim due targets, publish them, update post statuses. */
export async function runPublishingCycle(opts: { limit?: number; postId?: string } = {}): Promise<CycleResult> {
  const ids = await claimDueTargets(opts.limit ?? 25, opts.postId);
  const outcomes: TargetOutcome[] = [];
  // A few at a time: fast enough for a cron run, gentle on platform rate limits.
  for (let i = 0; i < ids.length; i += 4) {
    const batch = await Promise.all(ids.slice(i, i + 4).map((id) => publishTarget(id).catch(() => null)));
    outcomes.push(...batch.filter((o): o is TargetOutcome => o !== null));
  }
  for (const postId of new Set(outcomes.map((o) => o.postId))) await refreshPostStatus(postId);
  return {
    claimed: ids.length,
    published: outcomes.filter((o) => o.status === "published").length,
    failed: outcomes.filter((o) => o.status === "failed").length,
    outcomes,
  };
}

/** Publish one of the user's posts right away instead of waiting for the next cron run. */
export async function publishPostNow(userId: string, postId: string) {
  const db = getDb();
  const updated = await db
    .update(posts)
    .set({ status: "scheduled", scheduledAt: sql`now()`, updatedAt: sql`now()` })
    .where(and(eq(posts.id, postId), eq(posts.userId, userId), inArray(posts.status, ["draft", "pending_approval", "scheduled", "partial", "failed"])))
    .returning({ id: posts.id });
  if (!updated.length) return null;
  // Failed targets with no retry left get one more go when the user asks explicitly.
  await db
    .update(postTargets)
    .set({ status: "pending", nextAttemptAt: null, updatedAt: sql`now()` })
    .where(and(eq(postTargets.postId, postId), eq(postTargets.status, "failed")));
  await logEvent({ userId, postId, type: "post.publish_now", message: "Publish now requested" });
  return runPublishingCycle({ postId, limit: 20 });
}

