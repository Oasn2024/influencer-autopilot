import { redirect } from "next/navigation";
import { PageHeader, formatWhen } from "@/components/ui";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { PLATFORMS } from "@/lib/platforms";
import { requireUserId } from "@/lib/users";
import { AutopilotForm } from "./autopilot-form";

export default async function AutopilotPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const [settings, accounts] = await Promise.all([getAutopilotSettings(userId), listConnectedAccounts(userId)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Autopilot">
        Pick your weekly posting times and topics. Autopilot keeps the next {settings.horizonDays} days filled with AI drafts in your voice and
        publishes them on time. Last run: {settings.lastRunAt ? formatWhen(settings.lastRunAt, settings.timezone) : "never"}.
      </PageHeader>
      <AutopilotForm
        initial={{
          enabled: settings.enabled,
          timezone: settings.timezone,
          slots: settings.slots,
          accountIds: settings.accountIds,
          brandVoice: settings.brandVoice,
          topics: settings.topics,
          requireApproval: settings.requireApproval,
          horizonDays: settings.horizonDays,
        }}
        accounts={accounts.map((a) => ({
          id: a.id,
          label: `${PLATFORMS[a.platform].name} · ${a.displayName ?? a.handle ?? a.externalAccountId}`,
          platform: a.platform,
          textCapable: PLATFORMS[a.platform].supports.includes("text"),
          active: a.status === "active",
        }))}
      />
    </div>
  );
}
