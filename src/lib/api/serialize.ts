import type { PostWithTargets } from "@/lib/publishing/posts";

/** Public API shape of a post: stable field names, no internal columns. */
export function serializePost(p: PostWithTargets) {
  return {
    id: p.id,
    status: p.status,
    source: p.source,
    body: p.body,
    media_urls: p.mediaUrls,
    scheduled_at: p.scheduledAt,
    published_at: p.publishedAt,
    created_at: p.createdAt,
    targets: p.targets.map((t) => ({
      id: t.id,
      account_id: t.connectedAccountId,
      platform: t.platform,
      account_name: t.accountName,
      status: t.status,
      caption_override: t.bodyOverride,
      url: t.externalPostUrl,
      attempts: t.attempts,
      next_attempt_at: t.nextAttemptAt,
      error: t.lastError,
      published_at: t.publishedAt,
    })),
  };
}
