import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { PLATFORMS } from "@/lib/platforms";
import { requireUserId } from "@/lib/users";
import { Composer } from "./composer";

export default async function ComposePage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const [accounts, settings] = await Promise.all([listConnectedAccounts(userId), getAutopilotSettings(userId)]);
  const active = accounts.filter((a) => a.status === "active");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Compose">Write once, tailor per platform, then publish now or schedule it.</PageHeader>
      {active.length === 0 ? (
        <p className="text-sm text-muted">
          <Link href="/dashboard/accounts" className="text-accent underline">Connect an account</Link> to start posting.
        </p>
      ) : (
        <Composer
          timeZone={settings.timezone}
          accounts={active.map((a) => ({
            id: a.id,
            platform: a.platform,
            name: a.displayName ?? a.handle ?? a.externalAccountId,
            platformName: PLATFORMS[a.platform].name,
            maxLength: PLATFORMS[a.platform].maxTextLength ?? null,
            needsMedia: !PLATFORMS[a.platform].supports.includes("text"),
          }))}
        />
      )}
    </div>
  );
}
