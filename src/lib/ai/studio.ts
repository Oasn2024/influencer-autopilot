import "server-only";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { activityEvents } from "@/db/schema";
import { getAutopilotSettings } from "@/lib/autopilot/runner";
import { PLATFORM_IDS } from "@/lib/platforms";
import { logEvent } from "@/lib/publishing/events";
import { generateDraftOptions } from "./drafts";
import { generatePostImage, imagesEnabled } from "./images";
import { ASPECT_IDS, GOAL_IDS, TONES } from "./models";

/** Daily per-user caps so one account (or a leaked API key) can't run up the AI bill. */
export const DAILY_LIMITS = { draft: 60, image: 20 } as const;

export class StudioError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

async function usedToday(userId: string, type: string) {
  const since = new Date(Date.now() - 86_400_000);
  const [row] = await getDb()
    .select({ n: count() })
    .from(activityEvents)
    .where(and(eq(activityEvents.userId, userId), eq(activityEvents.type, type), gte(activityEvents.createdAt, since)));
  return row?.n ?? 0;
}

async function checkLimit(userId: string, kind: keyof typeof DAILY_LIMITS) {
  if ((await usedToday(userId, `ai.${kind}`)) >= DAILY_LIMITS[kind]) {
    throw new StudioError(`You've reached today's limit of ${DAILY_LIMITS[kind]} AI ${kind === "draft" ? "writes" : "images"}. It resets over the next 24 hours.`, 429);
  }
}

export const draftInputSchema = z
  .object({
    topic: z.string().max(500).default(""),
    platforms: z.array(z.enum(PLATFORM_IDS)).min(1, "Pick at least one account first").max(9),
    notes: z.string().max(1000).optional(),
    model: z.string().max(100).nullish(),
    tone: z.enum(TONES).optional(),
    goal: z.enum(GOAL_IDS).optional(),
    count: z.number().int().min(1).max(3).optional(),
    sourceText: z.string().max(20000).optional(),
  })
  .refine((v) => v.topic.trim().length >= 2 || (v.sourceText?.trim().length ?? 0) >= 50, {
    message: "Tell the AI what the post is about, or paste something to repurpose",
  });

export async function writeDrafts(userId: string, input: z.input<typeof draftInputSchema>) {
  const parsed = draftInputSchema.safeParse(input);
  if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? "Invalid request");
  await checkLimit(userId, "draft");
  const settings = await getAutopilotSettings(userId);
  const v = parsed.data;
  const options = await generateDraftOptions({
    ...v,
    topic: v.topic.trim(),
    sourceText: v.sourceText?.trim() || undefined,
    brandVoice: settings.brandVoice,
  });
  await logEvent({ userId, type: "ai.draft", message: `AI wrote ${options.length} option(s) with ${options[0]?.model ?? "AI"}` });
  return options;
}

export const imageInputSchema = z.object({
  prompt: z.string().trim().min(3, "Describe the image you want").max(1000),
  aspect: z.enum(ASPECT_IDS).optional(),
  model: z.string().max(100).nullish(),
});

export async function makeImage(userId: string, input: z.input<typeof imageInputSchema>) {
  if (!imagesEnabled()) throw new StudioError("AI images aren't switched on yet: the app needs a Vercel Blob store connected.", 503);
  const parsed = imageInputSchema.safeParse(input);
  if (!parsed.success) throw new StudioError(parsed.error.issues[0]?.message ?? "Invalid request");
  await checkLimit(userId, "image");
  const image = await generatePostImage(userId, parsed.data);
  await logEvent({ userId, type: "ai.image", message: `AI image created with ${image.model}` });
  return image;
}
