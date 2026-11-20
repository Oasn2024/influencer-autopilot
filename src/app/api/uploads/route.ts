import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { imagesEnabled } from "@/lib/ai/images";
import { requireUserId } from "@/lib/users";

/** What creators can upload: the formats the platforms accept. */
const UPLOAD_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/quicktime"];
const MAX_BYTES = 200 * 1024 * 1024;

/**
 * Issues short-lived tokens so the browser uploads straight to Vercel Blob (files never pass
 * through our server). Each signed-in user can only write under their own folder.
 */
export async function POST(req: Request) {
  if (!imagesEnabled()) return NextResponse.json({ error: "Uploads aren't switched on yet" }, { status: 503 });
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname) => {
        const prefix = `uploads/${userId}/`;
        if (!pathname.startsWith(prefix) || pathname.includes("..")) throw new Error("Invalid upload path");
        return { allowedContentTypes: UPLOAD_TYPES, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, validUntil: Date.now() + 10 * 60_000 };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 400 });
  }
}
