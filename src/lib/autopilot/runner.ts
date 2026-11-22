import "server-only";
import { and, desc, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { autopilotSettings, connectedAccounts, posts, type AutopilotSettings } from "@/db/schema";
import { generateDraft } from "@/lib/ai/drafts";
import { PLATFORMS } from "@/lib/platforms";
import { logEvent } from "@/lib/publishing/events";
import { createPost } from "@/lib/publishing/posts";
import { serializePost } from "@/lib/api/serialize";
import { emitWebhookEvent } from "@/lib/webhooks";
import { freeSlots, upcomingSlots } from "./time";

/** Drafts created per user per run, so one run stays fast and cheap. */
const MAX_DRAFTS_PER_RUN = 3;

export const DEFAULT_SETTINGS: Omit<AutopilotSettings, "userId" | "updatedAt" | "lastRunAt"> = {
  enabled: false,
  timezone: "UTC",
  slots: [],
  accountIds: [],
  brandVoice: "",
  topics: [],
  requireApproval: true,
  horizonDays: 7,
  writer: "app",
  agentNotifiedKey: null,
  agentNotifiedAt: null,
};

export async function getAutopilotSettings(userId: string): Promise<AutopilotSettings> {
  const [row] = await getDb().select().from(autopilotSettings).where(eq(autopilotSettings.userId, userId)).limit(1);
  return row ?? { ...DEFAULT_SETTINGS, userId, updatedAt: new Date(0), lastRunAt: null };
}

export type AutopilotSettingsInput = Omit<AutopilotSettings, "userId" | "updatedAt" | "lastRunAt" | "agentNotifiedKey" | "agentNotifiedAt">;

export async function saveAutopilotSettings(userId: string, input: AutopilotSettingsInput) {
  // Changing settings resets agent notifications, so the agent hears about the new schedule.
  const values = { ...input, userId, updatedAt: new Date(), agentNotifiedKey: null, agentNotifiedAt: null };
  const [row] = await getDb()
    .insert(autopilotSettings)
    .values(values)
    .onConflictDoUpdate({ target: autopilotSettings.userId, set: values })
    .returning();
  await logEvent({
    userId,
    type: "autopilot.updated",
    message: `Autopilot ${input.enabled ? "on" : "off"}, ${input.slots.length} weekly posting time(s), written by ${input.writer === "agent" ? "your own AI agent" : "the app's AI"}`,
  });
  return row;
}

/** Picks the topic used least recently, so autopilot rotates through all of them. */
export function pickTopic(topics: string[], recentTopics: string[]): string {
  if (topics.length === 0) return "something useful or behind-the-scenes for my audience";
  const unused = topics.find((t) => !recentTopics.includes(t));
  if (unused) return unused;
  return [...topics].sort((a, b) => recentTopics.lastIndexOf(a) - recentTopics.lastIndexOf(b))[0];
}

export type AutopilotRunResult = { userId: string; created: number; skipped?: string };

/** Autopilot's selected accounts that are still connected. */
async function activeSelectedAccounts(settings: AutopilotSettings) {
  if (!settings.accountIds.length) return [];
  return getDb()
    .select({ id: connectedAccounts.id, platform: connectedAccounts.platform, displayName: connectedAccounts.displayName, handle: connectedAccounts.handle })
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.userId, settings.userId), inArray(connectedAccounts.id, settings.accountIds), eq(connectedAccounts.status, "active")));
}

/** Upcoming posting times in the horizon that have no post yet. */
export async function openSlotsFor(settings: AutopilotSettings, now = new Date()): Promise<Date[]> {
  if (settings.slots.length === 0) return [];
  const horizonEnd = new Date(now.getTime() + settings.horizonDays * 86_400_000);
  const taken = await getDb()
    .select({ at: posts.scheduledAt })
    .from(posts)
    .where(
      and(
        eq(posts.userId, settings.userId),
        isNotNull(posts.scheduledAt),
        inArray(posts.status, ["pending_approval", "scheduled", "publishing", "published", "partial"]),
        gte(posts.scheduledAt, now),
        lte(posts.scheduledAt, horizonEnd),
      ),
    );
  // Leave 15 minutes of lead time so a slot isn't filled just as it fires.
  const from = new Date(now.getTime() + 15 * 60_000);
  return freeSlots(
    upcomingSlots(settings.slots, settings.timezone, from, settings.horizonDays),
    taken.map((t) => t.at!).filter(Boolean),
  );
}

/** What an outside agent needs to fill the schedule: open times, where to post and how to sound. */
export async function agentBrief(settings: AutopilotSettings, now = new Date()) {
  const [open, accounts] = await Promise.all([openSlotsFor(settings, now), activeSelectedAccounts(settings)]);
  return {
    enabled: settings.enabled,
    writer: settings.writer,
    timezone: settings.timezone,
    require_approval: settings.requireApproval,
    brand_voice: settings.brandVoice,
    topics: settings.topics,
    open_slots: open.map((d) => d.toISOString()),
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      name: a.displayName ?? a.handle,
      needs_media: !PLATFORMS[a.platform].supports.includes("text"),
      max_length: PLATFORMS[a.platform].maxTextLength ?? null,
    })),
  };
}

/** Repeat an unchanged agent notification at most this often. */
const AGENT_RENOTIFY_MS = 12 * 3600_000;

/** Agent mode: don't write anything; tell the user's agent (webhook) which slots are open. */
async function notifyAgent(settings: AutopilotSettings, now: Date, force = false): Promise<string | undefined> {
  const brief = await agentBrief(settings, now);
  if (brief.accounts.length === 0) return "no active accounts selected";
  if (brief.open_slots.length === 0) return force ? "every upcoming time already has a post" : undefined;
  const key = brief.open_slots.join(",");
  const recent = settings.agentNotifiedAt && now.getTime() - settings.agentNotifiedAt.getTime() < AGENT_RENOTIFY_MS;
  if (!force && settings.agentNotifiedKey === key && recent) return undefined;
  const sent = await emitWebhookEvent(settings.userId, "autopilot.slots_open", brief);
  await getDb().update(autopilotSettings).set({ agentNotifiedKey: key, agentNotifiedAt: now }).where(eq(autopilotSettings.userId, settings.userId));
  await logEvent({
    userId: settings.userId,
    type: "autopilot.agent_notified",
    message: `${brief.open_slots.length} open posting time(s) for your AI agent${
      sent.attempted ? `, delivered to ${sent.delivered} of ${sent.attempted} webhook(s)` : " (no webhook set up, so your agent will see them when it checks in)"
    }`,
  });
  return undefined;
}

/** Fills this user's empty posting slots within the horizon with AI drafts. */
export async function runAutopilotForUser(settings: AutopilotSettings, now = new Date(), opts: { force?: boolean } = {}): Promise<AutopilotRunResult> {
  const db = getDb();
  const { userId } = settings;
  const done = async (created: number, skipped?: string) => {
    await db.update(autopilotSettings).set({ lastRunAt: now }).where(eq(autopilotSettings.userId, userId));
    return { userId, created, skipped };
  };
  if (!settings.enabled) return { userId, created: 0, skipped: "disabled" };
  if (settings.slots.length === 0) return done(0, "no posting times");
  if (settings.writer === "agent") return done(0, await notifyAgent(settings, now, opts.force));

  const selected = await activeSelectedAccounts(settings);
  // Autopilot writes text; image/video-only platforms (Instagram) need a person to add media.
  const accounts = selected.filter((a) => PLATFORMS[a.platform].supports.includes("text"));
  if (accounts.length === 0) return done(0, selected.length ? "selected accounts need media (add posts by hand)" : "no active accounts selected");

  const open = (await openSlotsFor(settings, now)).slice(0, MAX_DRAFTS_PER_RUN);
  if (open.length === 0) return done(0);

  const recent = await db
    .select({ body: posts.body, generation: posts.generation })
    .from(posts)
    .where(eq(posts.userId, userId))
    .orderBy(desc(posts.createdAt))
    .limit(10);
  const recentTopics = recent.map((r) => String(r.generation?.topic ?? "")).filter(Boolean).reverse();
  const platforms = [...new Set(accounts.map((a) => a.platform))];

  let created = 0;
  for (const at of open) {
    const topic = pickTopic(settings.topics, recentTopics);
    try {
      const draft = await generateDraft({ topic, brandVoice: settings.brandVoice, platforms, recentPosts: recent.map((r) => r.body) });
      const overrides = Object.fromEntries(accounts.map((a) => [a.id, draft.variants[a.platform] ?? ""]).filter(([, v]) => v));
      const post = await createPost(userId, {
        body: draft.body,
        accountIds: accounts.map((a) => a.id),
        overrides,
        scheduledAt: at,
        status: settings.requireApproval ? "pending_approval" : "scheduled",
        source: "autopilot",
        generation: { topic, model: draft.model, hashtags: draft.hashtags },
      });
      if (post.status === "pending_approval") await emitWebhookEvent(userId, "post.pending_approval", serializePost(post));
      recentTopics.push(topic);
      recent.unshift({ body: draft.body, generation: { topic } });
      created++;
    } catch (err) {
      // Text-only drafts can't go to image-only platforms like Instagram: those surface here.
      await logEvent({
        userId,
        level: "warning",
        type: "autopilot.draft_failed",
        message: `Couldn't draft a post for ${at.toISOString()}: ${err instanceof Error ? err.message : "unknown error"}`,
      });
    }
  }
  return done(created);
}

/** Runs autopilot for every enabled user. Users run oldest-first so none starve. */
export async function runAutopilot(opts: { maxUsers?: number; now?: Date } = {}) {
  const users = await getDb()
    .select()
    .from(autopilotSettings)
    .where(eq(autopilotSettings.enabled, true))
    .orderBy(sql`${autopilotSettings.lastRunAt} asc nulls first`)
    .limit(opts.maxUsers ?? 20);
  const results: AutopilotRunResult[] = [];
  for (const s of users) {
    try {
      results.push(await runAutopilotForUser(s, opts.now));
    } catch (err) {
      results.push({ userId: s.userId, created: 0, skipped: err instanceof Error ? err.message : "error" });
    }
  }
  return results;
}
