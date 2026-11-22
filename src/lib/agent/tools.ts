import "server-only";
import { z } from "zod";
import { postStatusEnum } from "@/db/schema";
import { serializePost } from "@/lib/api/serialize";
import { listMetricRows } from "@/lib/analytics";
import { summarize } from "@/lib/analytics/insights";
import { StudioError, writeDrafts } from "@/lib/ai/studio";
import { agentBrief, getAutopilotSettings, openSlotsFor } from "@/lib/autopilot/runner";
import { listConnectedAccounts } from "@/lib/connected-accounts";
import { PLATFORM_IDS } from "@/lib/platforms";
import { publishPostNow } from "@/lib/publishing/engine";
import { cancelPost, createPost, getPost, listPosts, PostValidationError, schedulePost } from "@/lib/publishing/posts";

/**
 * Tools an outside AI agent (Claude, ChatGPT, Cursor, n8n...) can use on a creator's behalf.
 * The MCP server exposes these as-is; they run with the API key owner's permissions only.
 */
export class ToolError extends Error {
  constructor(message: string, readonly details?: unknown) {
    super(message);
  }
}

type Annotations = { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean; openWorldHint?: boolean };

export type AgentTool<S extends z.ZodType = z.ZodType> = {
  name: string;
  title: string;
  description: string;
  input: S;
  annotations: Annotations;
  run(userId: string, args: z.output<S>): Promise<unknown>;
};

const tool = <S extends z.ZodType>(t: AgentTool<S>) => t as unknown as AgentTool;

const id = z.uuid().describe("Post id");
const isoTime = z.iso.datetime({ offset: true });

async function mustGetPost(userId: string, postId: string) {
  const post = await getPost(userId, postId);
  if (!post) throw new ToolError("Post not found");
  return serializePost(post);
}

export const AGENT_TOOLS: AgentTool[] = [
  tool({
    name: "get_autopilot_brief",
    title: "Get autopilot brief",
    description:
      "Start here. Returns the creator's open posting times (ISO, UTC) that still need a post, the accounts autopilot posts to (with which ones need an image or video), their brand voice, topics and time zone, and whether posts need their approval.",
    input: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (userId) => agentBrief(await getAutopilotSettings(userId)),
  }),
  tool({
    name: "list_accounts",
    title: "List connected accounts",
    description: "All social accounts the creator has connected, with their ids. Use these ids in create_post.",
    input: z.object({}),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (userId) =>
      (await listConnectedAccounts(userId)).map((a) => ({ id: a.id, platform: a.platform, name: a.displayName ?? a.handle, handle: a.handle, status: a.status })),
  }),
  tool({
    name: "list_posts",
    title: "List posts",
    description: "Recent posts with their status on each account. Filter by status, e.g. ['pending_approval'] or ['scheduled'].",
    input: z.object({
      status: z.array(z.enum(postStatusEnum.enumValues)).optional().describe("Only these statuses"),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (userId, a) => (await listPosts(userId, { statuses: a.status, limit: a.limit })).map(serializePost),
  }),
  tool({
    name: "get_post",
    title: "Get a post",
    description: "One post and its result on each account (live link, error, retries).",
    input: z.object({ id }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: (userId, a) => mustGetPost(userId, a.id),
  }),
  tool({
    name: "create_post",
    title: "Create a post",
    description:
      "Writes a post to one or more accounts. Leave scheduled_at out to use the next open autopilot time. mode 'approval' (the default when the creator asked to approve posts) waits for their OK in the app; 'schedule' posts at the time without asking; 'draft' just saves it. Instagram needs at least one public image or video URL in media_urls.",
    input: z.object({
      body: z.string().max(70000).describe("The post text"),
      account_ids: z.array(z.uuid()).min(1).max(50).describe("Account ids from list_accounts or get_autopilot_brief"),
      media_urls: z.array(z.url()).max(10).default([]).describe("Public image or video URLs"),
      captions: z.record(z.uuid(), z.string().max(70000)).optional().describe("Different text for some accounts, keyed by account id"),
      scheduled_at: isoTime.optional().describe("When to post (ISO 8601 with offset). Omit to use the next open autopilot time"),
      mode: z.enum(["approval", "schedule", "draft"]).optional(),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (userId, a) => {
      const settings = await getAutopilotSettings(userId);
      const mode = a.mode ?? (settings.requireApproval ? "approval" : "schedule");
      let at = a.scheduled_at ? new Date(a.scheduled_at) : null;
      if (!at && mode !== "draft") at = (await openSlotsFor(settings))[0] ?? (mode === "schedule" ? new Date() : null);
      if (mode === "approval" && !at) throw new ToolError("No open autopilot time to use. Pass scheduled_at.");
      try {
        const post = await createPost(userId, {
          body: a.body,
          mediaUrls: a.media_urls,
          accountIds: a.account_ids,
          overrides: a.captions,
          scheduledAt: at,
          status: mode === "approval" ? "pending_approval" : mode === "schedule" ? "scheduled" : "draft",
          source: "agent",
          generation: { by: "agent" },
        });
        return serializePost(post);
      } catch (err) {
        if (err instanceof PostValidationError) throw new ToolError("The post can't be published as written", err.issues);
        throw err;
      }
    },
  }),
  tool({
    name: "approve_post",
    title: "Approve a post",
    description: "Moves a draft or pending post onto the schedule. Only do this when the creator has said yes.",
    input: z.object({ id, scheduled_at: isoTime.optional().describe("New time; omit to keep its time") }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: async (userId, a) => {
      const post = await schedulePost(userId, a.id, a.scheduled_at ? new Date(a.scheduled_at) : null);
      if (!post) throw new ToolError("Post not found");
      return serializePost(post);
    },
  }),
  tool({
    name: "publish_post_now",
    title: "Publish a post now",
    description: "Publishes a post right away on all its accounts instead of waiting for its time. This posts publicly.",
    input: z.object({ id }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    run: async (userId, a) => {
      if (!(await publishPostNow(userId, a.id))) throw new ToolError("Post can't be published (not found, canceled or already published)");
      return mustGetPost(userId, a.id);
    },
  }),
  tool({
    name: "cancel_post",
    title: "Cancel a post",
    description: "Cancels a post that hasn't gone out yet. Posts already live are not deleted from the platforms.",
    input: z.object({ id }),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    run: async (userId, a) => {
      if (!(await cancelPost(userId, a.id))) throw new ToolError("Post can't be canceled (not found or already out)");
      return { id: a.id, status: "canceled" };
    },
  }),
  tool({
    name: "get_post_stats",
    title: "Get post performance",
    description: "Likes, comments, shares and views per platform for posts published in the last N days, plus the top posts.",
    input: z.object({ days: z.number().int().min(1).max(90).default(30) }),
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (userId, a) => {
      const s = summarize(await listMetricRows(userId, a.days));
      return { ...s, top: s.top.map((r) => ({ post_id: r.postId, platform: r.platform, url: r.url, published_at: r.publishedAt, metrics: r.metrics, text: r.body.slice(0, 280) })) };
    },
  }),
  tool({
    name: "write_with_app_ai",
    title: "Write drafts with the app's AI",
    description:
      "Optional: asks this app's built-in AI writer for up to 3 post options in the creator's voice. Your own model can write posts instead; this counts toward the creator's daily AI limit.",
    input: z.object({
      topic: z.string().max(500),
      platforms: z.array(z.enum(PLATFORM_IDS)).min(1).max(9),
      notes: z.string().max(1000).optional(),
      count: z.number().int().min(1).max(3).default(1),
    }),
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: async (userId, a) => {
      try {
        return await writeDrafts(userId, a);
      } catch (err) {
        if (err instanceof StudioError) throw new ToolError(err.message);
        throw err;
      }
    },
  }),
];

/** JSON Schema for a tool's input, as MCP clients expect it. */
export function inputJsonSchema(t: AgentTool): Record<string, unknown> {
  const schema = { ...(z.toJSONSchema(t.input, { io: "input", unrepresentable: "any" }) as Record<string, unknown>) };
  delete schema.$schema;
  return { type: "object", properties: {}, ...schema };
}
