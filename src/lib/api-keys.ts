import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { apiKeys } from "@/db/schema";

const KEY_PREFIX = "iap_";

/** Keys are random; only their SHA-256 hash is stored, so a database leak doesn't leak keys. */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const key = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { key, prefix: key.slice(0, 10), hash: hashApiKey(key) };
}

export function looksLikeApiKey(value: string): boolean {
  return value.startsWith(KEY_PREFIX) && value.length >= 40 && /^[A-Za-z0-9_-]+$/.test(value);
}

/** Creates a key and returns the plaintext once; it can't be shown again. */
export async function createApiKey(userId: string, name: string) {
  const { key, prefix, hash } = generateApiKey();
  const [row] = await getDb()
    .insert(apiKeys)
    .values({ userId, name: name.trim().slice(0, 60) || "API key", prefix, keyHash: hash })
    .returning({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, createdAt: apiKeys.createdAt });
  return { ...row, key };
}

export async function listApiKeys(userId: string) {
  return getDb()
    .select({ id: apiKeys.id, name: apiKeys.name, prefix: apiKeys.prefix, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(userId: string, id: string) {
  const rows = await getDb()
    .update(apiKeys)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
    .returning({ id: apiKeys.id });
  return rows.length > 0;
}

/** Resolves a bearer key to its user, or null. */
export async function verifyApiKey(key: string): Promise<string | null> {
  if (!looksLikeApiKey(key)) return null;
  const db = getDb();
  const [row] = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hashApiKey(key)), isNull(apiKeys.revokedAt)))
    .limit(1);
  if (!row) return null;
  await db.update(apiKeys).set({ lastUsedAt: sql`now()` }).where(eq(apiKeys.id, row.id));
  return row.userId;
}
