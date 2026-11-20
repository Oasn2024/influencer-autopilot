import { redirect } from "next/navigation";
import { PageHeader, buttonClass, formatWhen } from "@/components/ui";
import { listApiKeys } from "@/lib/api-keys";
import { requireUserId } from "@/lib/users";
import { revokeApiKeyAction } from "../actions";
import { NewKey } from "./new-key";

const ENDPOINTS = [
  ["GET", "/api/v1/accounts", "Your connected accounts"],
  ["GET", "/api/v1/posts?status=scheduled,failed", "List posts with per-account results"],
  ["POST", "/api/v1/posts", "Create and schedule a post"],
  ["GET", "/api/v1/posts/{id}", "One post and its status on each account"],
  ["POST", "/api/v1/posts/{id}/publish", "Publish now"],
  ["DELETE", "/api/v1/posts/{id}", "Cancel a post that hasn't gone out"],
  ["POST", "/api/v1/drafts", "AI-written text for a topic, per platform"],
];

export default async function DevelopersPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const keys = await listApiKeys(userId);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="API">Connect your own tools (spreadsheets, Zapier, your website) to schedule and track posts.</PageHeader>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">API keys</h2>
        <NewKey />
        {keys.length > 0 && (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {keys.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                <span className="font-medium">{k.name}</span>
                <code className="text-muted">{k.prefix}…</code>
                <span className="text-xs text-muted">Created {formatWhen(k.createdAt)} · {k.lastUsedAt ? `last used ${formatWhen(k.lastUsedAt)}` : "never used"}</span>
                <form action={revokeApiKeyAction} className="ml-auto">
                  <input type="hidden" name="id" value={k.id} />
                  <button className={buttonClass}>Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Endpoints</h2>
        <p className="text-sm text-muted">Send your key as <code>Authorization: Bearer iap_…</code>. Responses are JSON with a <code>data</code> field; errors have an <code>error</code> field.</p>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {ENDPOINTS.map(([m, path, what]) => (
            <li key={m + path} className="flex flex-wrap gap-3 p-3">
              <code className="w-16 font-semibold">{m}</code>
              <code className="break-all">{path}</code>
              <span className="text-muted">{what}</span>
            </li>
          ))}
        </ul>
        <pre className="overflow-x-auto rounded-xl border border-border bg-card p-4 text-xs">{`curl -X POST "$APP_URL/api/v1/posts" \\
  -H "Authorization: Bearer $IAP_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "body": "Doors open at 10 tomorrow!",
    "account_ids": ["<account id from /api/v1/accounts>"],
    "scheduled_at": "2026-12-01T15:00:00Z"
  }'`}</pre>
      </section>
    </div>
  );
}
