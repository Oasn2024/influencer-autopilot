import "server-only";
import { NextResponse } from "next/server";
import { verifyApiKey } from "@/lib/api-keys";
import { PostValidationError } from "@/lib/publishing/posts";
import { requireUserId } from "@/lib/users";

export const apiError = (status: number, error: string, details?: unknown) =>
  NextResponse.json({ error, ...(details ? { details } : {}) }, { status });

/**
 * Developer API auth: `Authorization: Bearer iap_...`, or a signed-in browser session
 * (handy for trying the API from the dashboard).
 */
export async function apiUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (match) return verifyApiKey(match[1]);
  return requireUserId();
}

/** Wraps a handler: authenticates, and turns validation errors into 422s. */
export function withApiUser<C>(handler: (req: Request, userId: string, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C) => {
    const userId = await apiUserId(req);
    if (!userId) return apiError(401, "Missing or invalid API key");
    try {
      return await handler(req, userId, ctx);
    } catch (err) {
      if (err instanceof PostValidationError) return apiError(422, "Post can't be published as written", err.issues);
      console.error("api error", err);
      return apiError(500, "Something went wrong");
    }
  };
}
