import { NextResponse } from "next/server";
import { apiError, withApiUser } from "@/lib/api/http";
import { makeImage, StudioError, type imageInputSchema } from "@/lib/ai/studio";
import type { z } from "zod";

type ImageInput = z.input<typeof imageInputSchema>;

export const maxDuration = 60;

/** POST /api/v1/images: { prompt, aspect? ("1:1" | "4:5" | "9:16" | "16:9"), model? } → { data: { url, model } } */
export const POST = withApiUser(async (req, userId) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return apiError(400, "Send a JSON body");
  try {
    const image = await makeImage(userId, { prompt: String(b.prompt ?? ""), aspect: b.aspect, model: b.model } as ImageInput);
    return NextResponse.json({ data: image }, { status: 201 });
  } catch (err) {
    if (err instanceof StudioError) return apiError(err.status, err.message);
    throw err;
  }
});
