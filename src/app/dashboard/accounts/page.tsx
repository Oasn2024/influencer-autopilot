import { redirect } from "next/navigation";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { Badge } from "@/components/ui";
import { isProviderConfigured, providerForPlatform } from "@/lib/oauth/providers";
import { PLATFORMS } from "@/lib/platforms";
import { requireUserId } from "@/lib/users";
import { DisconnectButton } from "./disconnect-button";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ error?: string; connected?: string }> }) {
  const { error, connected } = await searchParams;
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const accounts = await listConnectedAccounts(userId);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold">Connected accounts</h1>
        <p className="mt-1 text-sm text-muted">Access tokens are encrypted with AES-256-GCM before they are saved and are never sent to your browser.</p>
      </div>

      {error && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm">{error.slice(0, 200)}</p>}
      {connected && <p className="rounded-md bg-green-500/10 p-3 text-sm">Connected {Number(connected) || 1} account(s).</p>}

      {accounts.length > 0 && (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-4">
              <div className="flex-1">
                <p className="font-medium">{a.displayName ?? a.handle ?? a.externalAccountId}</p>
                <p className="flex items-center gap-2 text-sm text-muted">{PLATFORMS[a.platform].name} <Badge status={a.status} /></p>
              </div>
              {a.status !== "active" && (
                <a href={`/api/connect/${a.platform}`} className="rounded-md bg-accent px-3 py-1 text-sm text-white">Reconnect</a>
              )}
              <DisconnectButton accountId={a.id} />
            </li>
          ))}
        </ul>
      )}

      <section>
        <h2 className="mb-3 font-semibold">Add an account</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {Object.values(PLATFORMS).map((p) => {
            const provider = providerForPlatform(p.id);
            const ready = p.available && provider && isProviderConfigured(provider);
            return (
            <li key={p.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <span className="font-medium">{p.name}</span>
              {ready ? (
                <a href={`/api/connect/${p.id}`} className="rounded-md bg-accent px-3 py-1 text-sm text-white">Connect</a>
              ) : p.available ? (
                <span className="text-right text-xs text-muted">Needs app keys</span>
              ) : (
                <span className="text-xs text-muted">Coming soon</span>
              )}
            </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
