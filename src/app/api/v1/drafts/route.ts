import { NextResponse } from "next/server";
import { apiError, withApiUser } from "@/lib/api/http";
import { StudioError, writeDrafts, type draftInputSchema } from "@/lib/ai/studio";
import type { z } from "zod";

type DraftInput = z.input<typeof draftInputSchema>;

export const maxDuration = 60;

/**
 * POST /api/v1/drafts: AI-written post options using the caller's brand voice.
 * Body: { topic, platforms[], notes?, model?, tone?, goal?, count? (1-3), source_text? }
 */
export const POST = withApiUser(async (req, userId) => {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== "object") return apiError(400, "Send a JSON body");
  try {
    const options = await writeDrafts(userId, {
      topic: typeof b.topic === "string" ? b.topic : "",
      platforms: b.platforms,
      notes: b.notes,
      model: b.model,
      tone: b.tone,
      goal: b.goal,
      count: b.count,
      sourceText: b.source_text ?? b.sourceText,
    } as DraftInput); // validated inside writeDrafts
    const [first] = options;
    // `data` stays the first option so existing callers keep working; `options` has them all.
    return NextResponse.json({ data: first, options });
  } catch (err) {
    if (err instanceof StudioError) return apiError(err.status, err.message);
    throw err;
  }
});
