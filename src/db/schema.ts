import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { PLATFORM_IDS } from "@/lib/platforms";

export const platformEnum = pgEnum("platform", PLATFORM_IDS);
export const accountStatusEnum = pgEnum("account_status", ["active", "expired", "revoked", "error"]);
export const postStatusEnum = pgEnum("post_status", [
  "draft",
  "pending_approval",
  "scheduled",
  "publishing",
  "published",
  "partial",
  "failed",
  "canceled",
]);
export const postSourceEnum = pgEnum("post_source", ["manual", "api", "autopilot", "agent"]);
/** Who writes autopilot posts: this app's AI, or the user's own AI agent (via MCP, the API or webhooks). */
export const autopilotWriterEnum = pgEnum("autopilot_writer", ["app", "agent"]);
export const eventLevelEnum = pgEnum("event_level", ["info", "warning", "error"]);
export const targetStatusEnum = pgEnum("target_status", ["pending", "publishing", "published", "failed", "skipped"]);

/** App users, keyed by their Clerk user id. */
export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id (user_...)
  email: text("email"),
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A social account the user has connected. Secrets are only ever stored as
 * ciphertext produced by src/lib/crypto/tokens.ts; never put a plaintext
 * token in any other column (including `metadata`).
 */
export const connectedAccounts = pgTable(
  "connected_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    platform: platformEnum("platform").notNull(),
    /** The account's id on the platform (page id, channel id, phone number id...). */
    externalAccountId: text("external_account_id").notNull(),
    displayName: text("display_name"),
    handle: text("handle"),
    avatarUrl: text("avatar_url"),
    status: accountStatusEnum("status").notNull().default("active"),
    scopes: text("scopes").array().notNull().default([]),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    /** Non-secret platform data only (e.g. page category). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("connected_accounts_user_platform_external_idx").on(t.userId, t.platform, t.externalAccountId),
    index("connected_accounts_user_idx").on(t.userId),
  ],
);

/** A piece of content, written once and published to one or more accounts. */
export const posts = pgTable(
  "posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull().default(""),
    mediaUrls: text("media_urls").array().notNull().default([]),
    status: postStatusEnum("status").notNull().default("draft"),
    source: postSourceEnum("source").notNull().default("manual"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Set when the content was drafted by the AI generator (prompt, model, etc). */
    generation: jsonb("generation").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("posts_user_idx").on(t.userId), index("posts_due_idx").on(t.status, t.scheduledAt)],
);

/** One row per (post, account): lets each platform succeed or fail independently. */
/** Engagement counts for one published post on one platform. Missing fields weren't available. */
export type TargetMetrics = { likes?: number; comments?: number; shares?: number; views?: number; error?: string };

export const postTargets = pgTable(
  "post_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    postId: uuid("post_id").notNull().references(() => posts.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id").notNull().references(() => connectedAccounts.id, { onDelete: "cascade" }),
    /** Per-platform caption override; falls back to posts.body. */
    bodyOverride: text("body_override"),
    status: targetStatusEnum("status").notNull().default("pending"),
    externalPostId: text("external_post_id"),
    externalPostUrl: text("external_post_url"),
    attempts: integer("attempts").notNull().default(0),
    /** When a failed target may be retried; null means no retry is planned. */
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Latest engagement numbers read back from the platform. */
    metrics: jsonb("metrics").$type<TargetMetrics>(),
    metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("post_targets_post_account_idx").on(t.postId, t.connectedAccountId),
    index("post_targets_retry_idx").on(t.status, t.nextAttemptAt),
    index("post_targets_published_idx").on(t.status, t.publishedAt),
  ],
);

export type AutopilotSlot = { day: number; time: string }; // day 0=Sunday, time "HH:MM" in the user's timezone

/** Per-user autopilot: when to post, and how AI should write when it fills empty slots. */
export const autopilotSettings = pgTable("autopilot_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  timezone: text("timezone").notNull().default("UTC"),
  slots: jsonb("slots").$type<AutopilotSlot[]>().notNull().default([]),
  /** Accounts autopilot posts to by default. */
  accountIds: uuid("account_ids").array().notNull().default([]),
  brandVoice: text("brand_voice").notNull().default(""),
  topics: text("topics").array().notNull().default([]),
  /** When true, AI drafts wait for the user's approval before they are scheduled. */
  requireApproval: boolean("require_approval").notNull().default(true),
  /** How many days ahead autopilot keeps filled. */
  horizonDays: integer("horizon_days").notNull().default(7),
  writer: autopilotWriterEnum("writer").notNull().default("app"),
  /** Agent mode: the open slots we last told the user's agent about, so we don't repeat ourselves every run. */
  agentNotifiedKey: text("agent_notified_key"),
  agentNotifiedAt: timestamp("agent_notified_at", { withTimezone: true }),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Monitoring log: everything the publisher and autopilot did, per user. */
export const activityEvents = pgTable(
  "activity_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    postId: uuid("post_id").references(() => posts.id, { onDelete: "cascade" }),
    postTargetId: uuid("post_target_id").references(() => postTargets.id, { onDelete: "cascade" }),
    connectedAccountId: uuid("connected_account_id").references(() => connectedAccounts.id, { onDelete: "set null" }),
    level: eventLevelEnum("level").notNull().default("info"),
    type: text("type").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_events_user_created_idx").on(t.userId, t.createdAt)],
);

/** Personal API keys for the developer API. Only a SHA-256 hash of each key is stored. */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** First characters of the key, shown in the UI so users can tell keys apart. */
    prefix: text("prefix").notNull(),
    keyHash: text("key_hash").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("api_keys_hash_idx").on(t.keyHash), index("api_keys_user_idx").on(t.userId)],
);

/**
 * Outgoing webhooks: we POST signed JSON to the user's own tools (their AI agent, Zapier, n8n...)
 * when things happen. The signing secret is stored encrypted, like platform tokens.
 */
export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** Event types to send; empty means all. */
    events: text("events").array().notNull().default([]),
    secretEnc: text("secret_enc").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    failureCount: integer("failure_count").notNull().default(0),
    lastStatus: integer("last_status"),
    lastError: text("last_error"),
    lastDeliveredAt: timestamp("last_delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhooks_user_idx").on(t.userId)],
);

export type User = typeof users.$inferSelect;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostTarget = typeof postTargets.$inferSelect;
export type AutopilotSettings = typeof autopilotSettings.$inferSelect;
export type ActivityEvent = typeof activityEvents.$inferSelect;
export type Webhook = typeof webhooks.$inferSelect;
export type PostStatus = (typeof postStatusEnum.enumValues)[number];
export type TargetStatus = (typeof targetStatusEnum.enumValues)[number];
