"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Draft } from "@/lib/ai/drafts";
import { makeImage, StudioError, writeDrafts, type draftInputSchema, type imageInputSchema } from "@/lib/ai/studio";
import { createApiKey, revokeApiKey } from "@/lib/api-keys";
import { listMetricRows, refreshMetrics } from "@/lib/analytics";
import { learnBestTimes, toSlots } from "@/lib/analytics/insights";
import { getAutopilotSettings, runAutopilotForUser, saveAutopilotSettings } from "@/lib/autopilot/runner";
import { isValidTimeZone, parseSlotTime } from "@/lib/autopilot/time";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { publishPostNow } from "@/lib/publishing/engine";
import { cancelPost, createPost, PostValidationError, retryTarget, schedulePost } from "@/lib/publishing/posts";
import { requireUserId } from "@/lib/users";

async function userIdOrRedirect() {
  const userId = await requireUserId();
  if (!userId) redirect("/sign-in");
  return userId;
}

type DraftInput = z.input<typeof draftInputSchema>;
type ImageInput = z.input<typeof imageInputSchema>;

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

export type DraftOption = Draft & { angle: string };

export async function draftWithAi(input: DraftInput): Promise<ActionResult<DraftOption[]>> {
  const userId = await userIdOrRedirect();
  try {
    return { ok: true, data: await writeDrafts(userId, input) };
  } catch (err) {
    if (err instanceof StudioError) return { ok: false, error: err.message };
    console.error("draft failed", err);
    return { ok: false, error: "The AI writer isn't available right now. Try another model, or write the post yourself." };
  }
}

export async function generateImageAction(input: ImageInput): Promise<ActionResult<{ url: string; model: string }>> {
  const userId = await userIdOrRedirect();
  try {
    return { ok: true, data: await makeImage(userId, input) };
  } catch (err) {
    if (err instanceof StudioError) return { ok: false, error: err.message };
    console.error("image failed", err);
    return { ok: false, error: "The image generator isn't available right now. Try the other image model." };
  }
}

const composeSchema = z.object({
  body: z.string().max(70000),
  mediaUrls: z.array(z.string()).max(10),
  accountIds: z.array(z.uuid()).min(1, "Pick at least one account"),
  overrides: z.record(z.string(), z.string()),
  /** ISO time, or null to publish right away. */
  scheduledAt: z.string().nullable(),
  mode: z.enum(["draft", "schedule", "now"]),
  generation: z.record(z.string(), z.unknown()).nullable(),
});

export async function savePost(input: z.input<typeof composeSchema>): Promise<ActionResult<{ id: string }>> {
  const userId = await userIdOrRedirect();
  const parsed = composeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid post" };
  const v = parsed.data;
  const when = v.mode === "schedule" && v.scheduledAt ? new Date(v.scheduledAt) : v.mode === "now" ? new Date() : null;
  if (v.mode === "schedule" && (!when || Number.isNaN(when.getTime()))) return { ok: false, error: "Pick a date and time" };
  try {
    const post = await createPost(userId, {
      body: v.body,
      mediaUrls: v.mediaUrls,
      accountIds: v.accountIds,
      overrides: v.overrides,
      scheduledAt: when,
      status: v.mode === "draft" ? "draft" : "scheduled",
      generation: v.generation,
    });
    if (v.mode === "now") await publishPostNow(userId, post.id);
    revalidatePath("/dashboard", "layout");
    return { ok: true, data: { id: post.id } };
  } catch (err) {
    if (err instanceof PostValidationError) return { ok: false, error: err.message };
    throw err;
  }
}

const idFrom = (form: FormData, key = "id") => {
  const v = String(form.get(key) ?? "");
  return z.uuid().safeParse(v).success ? v : null;
};

export async function approvePostAction(form: FormData) {
  const userId = await userIdOrRedirect();
  const id = idFrom(form);
  if (id) await schedulePost(userId, id);
  revalidatePath("/dashboard", "layout");
}

export async function cancelPostAction(form: FormData) {
  const userId = await userIdOrRedirect();
  const id = idFrom(form);
  if (id) await cancelPost(userId, id);
  revalidatePath("/dashboard", "layout");
}

export async function publishNowAction(form: FormData) {
  const userId = await userIdOrRedirect();
  const id = idFrom(form);
  if (id) await publishPostNow(userId, id);
  revalidatePath("/dashboard", "layout");
}

export async function retryTargetAction(form: FormData) {
  const userId = await userIdOrRedirect();
  const id = idFrom(form);
  if (id) {
    const postId = await retryTarget(userId, id);
    if (postId) await publishPostNow(userId, postId);
  }
  revalidatePath("/dashboard", "layout");
}

const slotSchema = z.object({ day: z.number().int().min(0).max(6), time: z.string().refine((t) => parseSlotTime(t) !== null) });
const autopilotSchema = z.object({
  enabled: z.boolean(),
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone"),
  slots: z.array(slotSchema).max(56),
  accountIds: z.array(z.uuid()).max(50),
  brandVoice: z.string().max(2000),
  topics: z.array(z.string().min(1).max(200)).max(30),
  requireApproval: z.boolean(),
  horizonDays: z.number().int().min(1).max(30),
});

export async function saveAutopilotAction(input: z.input<typeof autopilotSchema>): Promise<ActionResult> {
  const userId = await userIdOrRedirect();
  const parsed = autopilotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  const owned = new Set((await listConnectedAccounts(userId)).map((a) => a.id));
  await saveAutopilotSettings(userId, { ...parsed.data, accountIds: parsed.data.accountIds.filter((id) => owned.has(id)) });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

export async function runAutopilotNowAction(): Promise<ActionResult<{ created: number; note?: string }>> {
  const userId = await userIdOrRedirect();
  const settings = await getAutopilotSettings(userId);
  if (!settings.enabled) return { ok: false, error: "Turn autopilot on and save first" };
  const result = await runAutopilotForUser(settings);
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { created: result.created, note: result.skipped } };
}

export async function createApiKeyAction(name: string): Promise<ActionResult<{ key: string }>> {
  const userId = await userIdOrRedirect();
  const created = await createApiKey(userId, name);
  revalidatePath("/dashboard/developers");
  return { ok: true, data: { key: created.key } };
}

export async function revokeApiKeyAction(form: FormData) {
  const userId = await userIdOrRedirect();
  const id = idFrom(form);
  if (id) await revokeApiKey(userId, id);
  revalidatePath("/dashboard/developers");
}

export async function refreshStatsAction(): Promise<ActionResult<{ updated: number }>> {
  const userId = await userIdOrRedirect();
  const r = await refreshMetrics({ userId, limit: 30 });
  revalidatePath("/dashboard/analytics");
  return { ok: true, data: { updated: r.updated } };
}

/** Replaces autopilot's posting times with the ones your own results point to. */
export async function applyLearnedTimesAction(): Promise<ActionResult<{ slots: number }>> {
  const userId = await userIdOrRedirect();
  const settings = await getAutopilotSettings(userId);
  const learned = learnBestTimes(await listMetricRows(userId, 60), settings.timezone);
  if (!learned?.length) return { ok: false, error: "Not enough results yet to learn your best times" };
  const slots = toSlots(learned);
  const { enabled, timezone, accountIds, brandVoice, topics, requireApproval, horizonDays } = settings;
  await saveAutopilotSettings(userId, { enabled, timezone, accountIds, brandVoice, topics, requireApproval, horizonDays, slots });
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: { slots: slots.length } };
}
