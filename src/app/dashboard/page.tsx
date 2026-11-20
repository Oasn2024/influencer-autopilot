import Link from "next/link";
import { redirect } from "next/navigation";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { requireUserId } from "@/lib/users";

export default async function DashboardPage() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const accounts = await listConnectedAccounts(userId);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <Card title="Connected accounts" value={String(accounts.length)} href="/dashboard/accounts" />
        <Card title="Scheduled posts" value="0" note="Scheduling is coming next" />
        <Card title="AI drafts" value="0" note="Content generation is coming next" />
      </div>
      {accounts.length === 0 && (
        <p className="text-muted">
          Start by <Link className="text-accent underline" href="/dashboard/accounts">connecting a social account</Link>.
        </p>
      )}
    </div>
  );
}

function Card({ title, value, href, note }: { title: string; value: string; href?: string; note?: string }) {
  const body = (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-sm text-muted">{title}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
      {note && <p className="mt-1 text-xs text-muted">{note}</p>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
