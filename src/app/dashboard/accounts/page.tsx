import { redirect } from "next/navigation";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { PLATFORMS } from "@/lib/platforms";
import { requireUserId } from "@/lib/users";
import { DisconnectButton } from "./disconnect-button";

export default async function AccountsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const accounts = await listConnectedAccounts(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Connected accounts</h1>
        <p className="mt-1 text-sm text-muted">Access tokens are encrypted with AES-256-GCM before they are saved and are never sent to your browser.</p>
      </div>

      {accounts.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <p className="font-medium">{a.displayName ?? a.handle ?? a.externalAccountId}</p>
                <p className="text-sm text-muted">{PLATFORMS[a.platform].name} · {a.status}</p>
              </div>
              <DisconnectButton accountId={a.id} />
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Add an account</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.values(PLATFORMS).map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <span className="font-medium">{p.name}</span>
              {p.available ? (
                <a href={`/api/connect/${p.id}`} className="rounded-md bg-accent px-3 py-1 text-sm text-white">Connect</a>
              ) : (
                <span className="text-xs text-muted">Coming soon</span>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
