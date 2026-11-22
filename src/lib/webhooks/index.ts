import "server-only";
import { randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { webhooks, type Webhook } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto/tokens";
import { generateWebhookSecret, isPrivateAddress, signWebhook, webhookUrlProblem, type WebhookEventType } from "./core";

export * from "./core";

/** Per-user cap, so one account can't turn us into a request cannon. */
export const MAX_WEBHOOKS = 5;
/** After this many failures in a row a webhook is switched off until the user turns it back on. */
const DISABLE_AFTER_FAILURES = 25;

const aad = (userId: string, id: string) => ["webhook", userId, id].join("|");

export class WebhookError extends Error {}

export type PublicWebhook = Omit<Webhook, "secretEnc" | "userId">;

const publicColumns = {
  id: webhooks.id,
  url: webhooks.url,
  events: webhooks.events,
  enabled: webhooks.enabled,
  failureCount: webhooks.failureCount,
  lastStatus: webhooks.lastStatus,
  lastError: webhooks.lastError,
  lastDeliveredAt: webhooks.lastDeliveredAt,
  createdAt: webhooks.createdAt,
};

export async function listWebhooks(userId: string): Promise<PublicWebhook[]> {
  return getDb().select(publicColumns).from(webhooks).where(eq(webhooks.userId, userId)).orderBy(desc(webhooks.createdAt));
}

/** Creates a webhook and returns its signing secret once; it can't be shown again. */
export async function createWebhook(userId: string, url: string, events: string[]) {
  const problem = webhookUrlProblem(url);
  if (problem) throw new WebhookError(problem);
  const existing = await listWebhooks(userId);
  if (existing.length >= MAX_WEBHOOKS) throw new WebhookError(`You can have up to ${MAX_WEBHOOKS} webhooks. Delete one first.`);
  const id = randomUUID();
  const secret = generateWebhookSecret();
  const [row] = await getDb()
    .insert(webhooks)
    .values({ id, userId, url: url.trim(), events, secretEnc: encryptSecret(secret, aad(userId, id)) })
    .returning(publicColumns);
  return { ...row, secret };
}

export async function deleteWebhook(userId: string, id: string) {
  const rows = await getDb().delete(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, userId))).returning({ id: webhooks.id });
  return rows.length > 0;
}

export async function setWebhookEnabled(userId: string, id: string, enabled: boolean) {
  await getDb()
    .update(webhooks)
    .set({ enabled, ...(enabled ? { failureCount: 0 } : {}) })
    .where(and(eq(webhooks.id, id), eq(webhooks.userId, userId)));
}

/** Resolves the host and refuses private addresses, so a webhook can't reach our own network. */
async function assertPublicHost(url: URL) {
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0) throw new WebhookError("The webhook's host name doesn't resolve");
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new WebhookError("The webhook points at a private network address");
}

type Delivery = { ok: boolean; status: number | null; error: string | null };

async function deliver(hook: Webhook, type: WebhookEventType, data: unknown): Promise<Delivery> {
  const body = JSON.stringify({ id: `evt_${randomUUID()}`, type, created_at: new Date().toISOString(), data });
  let result: Delivery;
  try {
    const url = new URL(hook.url);
    const problem = webhookUrlProblem(hook.url);
    if (problem) throw new WebhookError(problem);
    await assertPublicHost(url);
    const secret = decryptSecret(hook.secretEnc, aad(hook.userId, hook.id));
    const res = await fetch(url, {
      method: "POST",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "InfluencerAutopilot-Webhooks/1.0",
        "X-IAP-Event": type,
        "X-IAP-Signature": signWebhook(secret, body),
      },
      body,
    });
    await res.body?.cancel().catch(() => {});
    result = res.ok ? { ok: true, status: res.status, error: null } : { ok: false, status: res.status, error: `Your endpoint answered ${res.status}` };
  } catch (err) {
    const message = err instanceof WebhookError ? err.message : err instanceof Error && err.name === "TimeoutError" ? "Timed out after 8 seconds" : "Couldn't reach the URL";
    result = { ok: false, status: null, error: message };
  }
  await getDb()
    .update(webhooks)
    .set(
      result.ok
        ? { lastStatus: result.status, lastError: null, lastDeliveredAt: sql`now()`, failureCount: 0 }
        : {
            lastStatus: result.status,
            lastError: result.error,
            failureCount: sql`${webhooks.failureCount} + 1`,
            enabled: sql`${webhooks.failureCount} + 1 < ${DISABLE_AFTER_FAILURES}`,
          },
    )
    .where(eq(webhooks.id, hook.id));
  return result;
}

/**
 * Sends an event to every enabled webhook of this user that wants it.
 * Never throws: a broken webhook must not break publishing or autopilot.
 */
export async function emitWebhookEvent(userId: string, type: WebhookEventType, data: unknown) {
  try {
    const hooks = await getDb().select().from(webhooks).where(and(eq(webhooks.userId, userId), eq(webhooks.enabled, true)));
    const wanted = hooks.filter((h) => h.events.length === 0 || h.events.includes(type));
    const results = await Promise.all(wanted.map((h) => deliver(h, type, data).catch(() => ({ ok: false }))));
    return { attempted: wanted.length, delivered: results.filter((r) => r.ok).length };
  } catch (err) {
    console.error("webhook emit failed", type, err instanceof Error ? err.message : err);
    return { attempted: 0, delivered: 0 };
  }
}

/** Sends a `webhook.test` event to one webhook and reports what happened. */
export async function sendTestWebhook(userId: string, id: string): Promise<Delivery> {
  const [hook] = await getDb().select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.userId, userId))).limit(1);
  if (!hook) return { ok: false, status: null, error: "Webhook not found" };
  return deliver(hook, "webhook.test", { message: "Hello from Influencer Autopilot. Your webhook works." });
}
