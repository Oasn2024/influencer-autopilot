import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withApiUser } from "@/lib/api/http";
import { serializePost } from "@/lib/api/serialize";
import { publishPostNow } from "@/lib/publishing/engine";
import { getPost } from "@/lib/publishing/posts";

export const maxDuration = 120;

/** POST /api/v1/posts/:id/publish: publish now instead of waiting for the schedule. */
export const POST = withApiUser<{ params: Promise<{ id: string }> }>(async (_req, userId, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return apiError(404, "Post not found");
  const result = await publishPostNow(userId, id);
  if (!result) return apiError(409, "Post can't be published (not found, canceled or already published)");
  const post = await getPost(userId, id);
  return NextResponse.json({ data: serializePost(post!) });
});
