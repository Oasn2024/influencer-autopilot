import { NextResponse } from "next/server";
import { z } from "zod";
import { generateDraft } from "@/lib/ai/drafts";
import { apiError, withApiUser } from "@/lib/api/http";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { PLATFORM_IDS } from "@/lib/platforms";

export const maxDuration = 60;

const schema = z.object({
  topic: z.string().min(2).max(500),
  platforms: z.array(z.enum(PLATFORM_IDS)).min(1).max(9),
  notes: z.string().max(1000).optional(),
});

/** POST /api/v1/drafts: AI-written post text (and per-platform variants), using the caller's brand voice. */
export const POST = withApiUser(async (req, userId) => {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, "Invalid request body", z.flattenError(parsed.error).fieldErrors);
  const settings = await getAutopilotSettings(userId);
  const draft = await generateDraft({ ...parsed.data, brandVoice: settings.brandVoice });
  return NextResponse.json({ data: draft });
});
