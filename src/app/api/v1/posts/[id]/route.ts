import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, withApiUser } from "@/lib/api/http";
import { serializePost } from "@/lib/api/serialize";
import { cancelPost, getPost } from "@/lib/publishing/posts";

type Ctx = { params: Promise<{ id: string }> };

async function postId(ctx: Ctx) {
  const { id } = await ctx.params;
  return z.uuid().safeParse(id).success ? id : null;
}

/** GET /api/v1/posts/:id: the post and the status on each account. */
export const GET = withApiUser<Ctx>(async (_req, userId, ctx) => {
  const id = await postId(ctx);
  const post = id ? await getPost(userId, id) : null;
  return post ? NextResponse.json({ data: serializePost(post) }) : apiError(404, "Post not found");
});

/** DELETE /api/v1/posts/:id: cancel a post that hasn't gone out yet. */
export const DELETE = withApiUser<Ctx>(async (_req, userId, ctx) => {
  const id = await postId(ctx);
  if (!id || !(await getPost(userId, id))) return apiError(404, "Post not found");
  return (await cancelPost(userId, id)) ? new NextResponse(null, { status: 204 }) : apiError(409, "Post has already been published");
});
