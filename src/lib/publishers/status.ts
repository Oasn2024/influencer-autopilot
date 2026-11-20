import type { PostStatus, TargetStatus } from "@/db/schema";

export const MAX_ATTEMPTS = 5;

/** Exponential backoff for retries: 1, 4, 16, 64 minutes (capped at 2h), then give up. */
export function retryDelayMs(attempts: number): number | null {
  if (attempts >= MAX_ATTEMPTS) return null;
  return Math.min(60_000 * 4 ** (attempts - 1), 2 * 60 * 60_000);
}

/** Overall post status derived from its per-account targets. */
export function rollupPostStatus(targets: { status: TargetStatus; nextAttemptAt?: Date | null }[]): PostStatus {
  if (targets.length === 0) return "draft";
  const s = targets.map((t) => t.status);
  if (s.some((x) => x === "publishing")) return "publishing";
  const retrying = targets.some((t) => (t.status === "failed" && t.nextAttemptAt) || t.status === "pending");
  if (retrying) return s.some((x) => x === "published") ? "publishing" : "scheduled";
  const published = s.filter((x) => x === "published").length;
  const done = s.filter((x) => x === "published" || x === "skipped").length;
  if (published > 0 && done === s.length) return "published";
  if (published > 0) return "partial";
  return "failed";
}
