import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withApiUser } from "@/lib/api/http";
import { serializePost } from "@/lib/api/serialize";
import { createPost, listPosts } from "@/lib/publishing/posts";
import { postStatusEnum } from "@/db/schema";

const createSchema = z.object({
  body: z.string().max(70000).default(""),
  media_urls: z.array(z.url()).max(10).default([]),
  account_ids: z.array(z.uuid()).min(1).max(50),
  /** Per-account captions, keyed by account id. */
  overrides: z.record(z.uuid(), z.string().max(70000)).optional(),
  /** ISO time. Omit with `draft: true` to save without scheduling; omit otherwise to publish on the next run. */
  scheduled_at: z.iso.datetime({ offset: true }).optional(),
  draft: z.boolean().default(false),
});

/** GET /api/v1/posts?status=scheduled,failed&limit=50 */
export const GET = withApiUser(async (req, userId) => {
  const url = new URL(req.url);
  const statuses = (url.searchParams.get("status") ?? "")
    .split(",")
    .filter((s): s is (typeof postStatusEnum.enumValues)[number] => (postStatusEnum.enumValues as readonly string[]).includes(s));
  const limit = Number(url.searchParams.get("limit") ?? 50) || 50;
  const rows = await listPosts(userId, { statuses, limit });
  return NextResponse.json({ data: rows.map(serializePost) });
});

/** POST /api/v1/posts: create a post for one or more accounts, scheduled or as a draft. */
export const POST = withApiUser(async (req, userId) => {
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request body", z.flattenError(parsed.error).fieldErrors);
  const b = parsed.data;
  const post = await createPost(userId, {
    body: b.body,
    mediaUrls: b.media_urls,
    accountIds: b.account_ids,
    overrides: b.overrides,
    scheduledAt: b.draft ? (b.scheduled_at ? new Date(b.scheduled_at) : null) : new Date(b.scheduled_at ?? Date.now()),
    status: b.draft ? "draft" : "scheduled",
    source: "api",
  });
  return NextResponse.json({ data: serializePost(post) }, { status: 201 });
});
