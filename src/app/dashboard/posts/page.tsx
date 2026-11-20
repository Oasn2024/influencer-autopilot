import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import type { PostStatus } from "@/db/schema";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { listPosts } from "@/lib/publishing/posts";
import { requireUserId } from "@/lib/users";
import { PostList } from "../post-list";

const TABS: Record<string, { label: string; statuses: PostStatus[] }> = {
  scheduled: { label: "Scheduled", statuses: ["scheduled", "publishing"] },
  approval: { label: "Needs approval", statuses: ["pending_approval"] },
  drafts: { label: "Drafts", statuses: ["draft"] },
  published: { label: "Published", statuses: ["published", "partial"] },
  failed: { label: "Failed", statuses: ["failed", "partial"] },
  all: { label: "All", statuses: [] },
};

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  const { tab: tabParam } = await searchParams;
  const tab = tabParam && TABS[tabParam] ? tabParam : "scheduled";
  const [posts, settings] = await Promise.all([listPosts(userId, { statuses: TABS[tab].statuses, limit: 100 }), getAutopilotSettings(userId)]);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Posts">Everything you&apos;ve written, scheduled or published, with the result on each account.</PageHeader>
      <nav className="flex flex-wrap gap-2">
        {Object.entries(TABS).map(([id, t]) => (
          <Link key={id} href={`/dashboard/posts?tab=${id}`} className={`rounded-full px-3 py-1 text-sm ${id === tab ? "bg-accent text-white" : "border border-border"}`}>
            {t.label}
          </Link>
        ))}
      </nav>
      <PostList posts={posts} timeZone={settings.timezone} empty={<>No posts here yet. <Link href="/dashboard/compose" className="text-accent underline">Write one</Link>.</>} />
    </div>
  );
}
