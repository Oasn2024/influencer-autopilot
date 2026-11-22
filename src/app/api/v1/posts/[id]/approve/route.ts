import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withApiUser } from "@/lib/api/http";
import { serializePost } from "@/lib/api/serialize";
import { schedulePost } from "@/lib/publishing/posts";

/** POST /api/v1/posts/:id/approve  { scheduled_at? }: put a draft or pending post on the schedule. */
export const POST = withApiUser<{ params: Promise<{ id: string }> }>(async (req, userId, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "Post not found");
  const body = (await req.json().catch(() => ({}))) as { scheduled_at?: unknown };
  const at = z.iso.datetime({ offset: true }).optional().safeParse(body?.scheduled_at ?? undefined);
  if (!at.success) return apiError(400, "scheduled_at must be an ISO 8601 time with an offset");
  const post = await schedulePost(userId, id, at.data ? new Date(at.data) : null);
  if (!post) return apiError(404, "Post not found");
  return NextResponse.json({ data: serializePost(post) });
});
