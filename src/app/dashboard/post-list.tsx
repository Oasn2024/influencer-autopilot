import { Badge, buttonClass, formatWhen } from "@/components/ui";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import type { PostWithTargets } from "@/lib/publishing/posts";
import { approvePostAction, cancelPostAction, publishNowAction, retryTargetAction } from "./actions";

export function PostList({ posts, timeZone, empty }: { posts: PostWithTargets[]; timeZone?: string; empty: React.ReactNode }) {
  if (posts.length === 0) return <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">{empty}</div>;
  return (
    <ul className="flex flex-col gap-3">
      {posts.map((p) => (
        <li key={p.id} className="rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge status={p.status} />
            {p.source !== "manual" && <span className="text-xs text-muted">via {p.source === "autopilot" ? "autopilot" : "API"}</span>}
            <span className="text-muted">{formatWhen(p.publishedAt ?? p.scheduledAt, timeZone)}</span>
          </div>
          <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm">{p.body || <em className="text-muted">(media only)</em>}</p>
          {p.mediaUrls.length > 0 && <p className="mt-1 text-xs text-muted">{p.mediaUrls.length} media item(s)</p>}
          <ul className="mt-3 flex flex-col gap-1.5">
            {p.targets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{PLATFORMS[t.platform as PlatformId]?.name ?? t.platform}</span>
                <span className="text-muted">{t.accountName}</span>
                <Badge status={t.status} />
                {t.externalPostUrl && (
                  <a href={t.externalPostUrl} target="_blank" rel="noreferrer" className="text-accent underline">View</a>
                )}
                {t.metrics && !t.metrics.error && (
                  <span className="text-xs tabular-nums text-muted" title="Likes · comments · shares">
                    ♥ {t.metrics.likes ?? 0} · 💬 {t.metrics.comments ?? 0} · ↻ {t.metrics.shares ?? 0}
                    {t.metrics.views ? ` · ${t.metrics.views} views` : ""}
                  </span>
                )}
                {t.status === "failed" && t.nextAttemptAt && <span className="text-xs text-muted">retrying {formatWhen(t.nextAttemptAt, timeZone)}</span>}
                {t.status === "failed" && !t.nextAttemptAt && (
                  <form action={retryTargetAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-accent underline">Retry</button>
                  </form>
                )}
                {t.lastError && t.status !== "published" && <span className="w-full text-xs text-red-600 dark:text-red-400">{t.lastError}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.status === "pending_approval" && <Action action={approvePostAction} id={p.id} label="Approve" primary />}
            {["draft", "pending_approval", "scheduled"].includes(p.status) && <Action action={publishNowAction} id={p.id} label="Publish now" />}
            {["draft", "pending_approval", "scheduled", "failed", "partial"].includes(p.status) && <Action action={cancelPostAction} id={p.id} label="Cancel" />}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Action({ action, id, label, primary }: { action: (f: FormData) => Promise<void>; id: string; label: string; primary?: boolean }) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={primary ? "rounded-md bg-accent px-3 py-1 text-sm font-medium text-white" : buttonClass}>{label}</button>
    </form>
  );
}
