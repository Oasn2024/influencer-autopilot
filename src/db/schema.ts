import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { PLATFORM_IDS } from "@/lib/platforms";

export const platformEnum = pgEnum("platform", PLATFORM_IDS);
export const accountStatusEnum = pgEnum("account_status", ["active", "expired", "revoked", "error"]);
export const postStatusEnum = pgEnum("post_status", ["draft", "scheduled", "publishing", "published", "failed", "canceled"]);
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
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    /** Set when the content was drafted by the AI generator (prompt, model, etc). */
    generation: jsonb("generation").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("posts_user_idx").on(t.userId), index("posts_due_idx").on(t.status, t.scheduledAt)],
);

/** One row per (post, account): lets each platform succeed or fail independently. */
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
    lastError: text("last_error"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("post_targets_post_account_idx").on(t.postId, t.connectedAccountId)],
);

export type User = typeof users.$inferSelect;
export type ConnectedAccount = typeof connectedAccounts.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type PostTarget = typeof postTargets.$inferSelect;
