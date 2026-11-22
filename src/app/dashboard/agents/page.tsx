import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, formatWhen } from "@/components/ui";
import { AGENT_TOOLS } from "@/lib/agent/tools";
import { listApiKeys } from "@/lib/api-keys";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { requireUserId } from "@/lib/users";
import { listWebhooks, MAX_WEBHOOKS, WEBHOOK_EVENTS } from "@/lib/webhooks";
import { NewKey } from "../developers/new-key";
import { Webhooks } from "./webhooks";

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "https://www.ia.saltechapps.com").replace(/\/$/, "");

function Snippet({ title, note, code }: { title: string; note?: React.ReactNode; code: string }) {
  return (
    <details className="rounded-xl border border-border bg-card p-4 open:shadow-sm">
      <summary className="cursor-pointer font-medium">{title}</summary>
      {note && <p className="mt-2 text-sm text-muted">{note}</p>}
      <pre className="mt-2 overflow-x-auto rounded-lg bg-background p-3 text-xs">{code}</pre>
    </details>
  );
}

export default async function AgentsPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const [keys, hooks, settings] = await Promise.all([listApiKeys(userId), listWebhooks(userId), getAutopilotSettings(userId)]);
  const mcp = `${appUrl()}/api/mcp`;
  const key = "YOUR_IAP_KEY";

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Your AI agent">
        Already use Claude, ChatGPT, Cursor or another AI agent? Connect it here so it can plan, write and schedule your posts. Your accounts and
        tokens stay safe in this app; your agent only gets the tools below, with your API key.
      </PageHeader>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">1. Create a key for your agent</h2>
        <NewKey />
        <p className="text-xs text-muted">
          {keys.length ? `You have ${keys.length} key(s). ` : ""}Use a separate key per tool so you can revoke one without breaking the others. Manage keys on the{" "}
          <Link href="/dashboard/developers" className="text-accent underline">API page</Link>.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">2. Connect your tool</h2>
        <p className="text-sm text-muted">
          MCP server URL: <code className="break-all rounded bg-card px-1.5 py-0.5">{mcp}</code>. Send the key as the header <code>Authorization: Bearer iap_…</code>.
        </p>
        <Snippet title="Claude Code" code={`claude mcp add --transport http influencer-autopilot ${mcp} \\\n  --header "Authorization: Bearer ${key}"`} />
        <Snippet
          title="Claude Desktop"
          note="Settings → Developer → Edit Config, add this, then restart Claude. It needs Node.js installed."
          code={JSON.stringify(
            { mcpServers: { "influencer-autopilot": { command: "npx", args: ["-y", "mcp-remote", mcp, "--header", "Authorization:${AUTH}"], env: { AUTH: `Bearer ${key}` } } } },
            null,
            2,
          )}
        />
        <Snippet title="Cursor (.cursor/mcp.json)" code={JSON.stringify({ mcpServers: { "influencer-autopilot": { url: mcp, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)} />
        <Snippet title="VS Code / GitHub Copilot (.vscode/mcp.json)" code={JSON.stringify({ servers: { "influencer-autopilot": { type: "http", url: mcp, headers: { Authorization: `Bearer ${key}` } } } }, null, 2)} />
        <Snippet
          title="ChatGPT (custom GPT)"
          note="In the GPT editor: Configure → Actions → Import from URL, paste this, then set Authentication to API Key, Bearer, and paste your key."
          code={`${appUrl()}/api/v1/openapi.json`}
        />
        <Snippet
          title="n8n, Make, Zapier or your own code"
          note="Call the REST API with the same key, and add a webhook below so your workflow hears when autopilot has open times."
          code={`curl ${appUrl()}/api/v1/autopilot -H "Authorization: Bearer ${key}"`}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">3. Let your agent run autopilot</h2>
        <p className="text-sm text-muted">
          On <Link href="/dashboard/autopilot" className="text-accent underline">Autopilot</Link>, choose <b>My own AI agent</b> under &quot;Who writes the posts&quot;. Autopilot then
          stops writing with this app&apos;s AI. It keeps your schedule, tells your agent which times are open, and publishes what your agent writes.
          {settings.writer === "agent" ? " This is on now." : " Right now the app's AI writes your posts."}
        </p>
        <p className="text-sm text-muted">Try asking your agent: &quot;Check my Influencer Autopilot brief and write posts for my open times this week.&quot;</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-semibold">Webhooks (optional)</h2>
        <p className="text-sm text-muted">We&apos;ll POST signed JSON to your agent or workflow when something happens, so it doesn&apos;t have to keep checking.</p>
        <Webhooks hooks={hooks} events={WEBHOOK_EVENTS} max={MAX_WEBHOOKS} />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">What your agent can do</h2>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {AGENT_TOOLS.map((t) => (
            <li key={t.name} className="flex flex-col gap-1 p-3 sm:flex-row sm:gap-3">
              <code className="shrink-0 font-semibold sm:w-48">{t.name}</code>
              <span className="text-muted">{t.description}</span>
            </li>
          ))}
        </ul>
        {settings.agentNotifiedAt && <p className="text-xs text-muted">Last told your agent about open times {formatWhen(settings.agentNotifiedAt, settings.timezone)}.</p>}
      </section>
    </div>
  );
}
