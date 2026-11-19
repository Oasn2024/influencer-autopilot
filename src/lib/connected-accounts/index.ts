import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { connectedAccounts, type ConnectedAccount } from "@/db/schema";
import type { PlatformId } from "@/lib/platforms";
import { openTokens, sealTokens, type PlainTokens } from "./sealing";

/** Shape that is safe to send to the browser: no token columns at all. */
export type PublicConnectedAccount = Pick<
  ConnectedAccount,
  "id" | "platform" | "externalAccountId" | "displayName" | "handle" | "avatarUrl" | "status" | "scopes" | "tokenExpiresAt" | "createdAt"
>;

const publicColumns = {
  id: connectedAccounts.id,
  platform: connectedAccounts.platform,
  externalAccountId: connectedAccounts.externalAccountId,
  displayName: connectedAccounts.displayName,
  handle: connectedAccounts.handle,
  avatarUrl: connectedAccounts.avatarUrl,
  status: connectedAccounts.status,
  scopes: connectedAccounts.scopes,
  tokenExpiresAt: connectedAccounts.tokenExpiresAt,
  createdAt: connectedAccounts.createdAt,
};

export async function listConnectedAccounts(userId: string): Promise<PublicConnectedAccount[]> {
  return getDb().select(publicColumns).from(connectedAccounts).where(eq(connectedAccounts.userId, userId)).orderBy(connectedAccounts.createdAt);
}

export type UpsertConnectionInput = {
  userId: string;
  platform: PlatformId;
  externalAccountId: string;
  tokens: PlainTokens;
  tokenExpiresAt?: Date | null;
  scopes?: string[];
  displayName?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  metadata?: Record<string, unknown>;
};

/** Called by each platform's OAuth callback once it has exchanged the code for tokens. */
export async function upsertConnectedAccount(input: UpsertConnectionInput): Promise<PublicConnectedAccount> {
  const identity = { userId: input.userId, platform: input.platform, externalAccountId: input.externalAccountId };
  const sealed = sealTokens(identity, input.tokens);
  const values = {
    ...identity,
    ...sealed,
    tokenExpiresAt: input.tokenExpiresAt ?? null,
    scopes: input.scopes ?? [],
    displayName: input.displayName ?? null,
    handle: input.handle ?? null,
    avatarUrl: input.avatarUrl ?? null,
    metadata: input.metadata ?? {},
    status: "active" as const,
    lastError: null,
  };
  const [row] = await getDb()
    .insert(connectedAccounts)
    .values(values)
    .onConflictDoUpdate({
      target: [connectedAccounts.userId, connectedAccounts.platform, connectedAccounts.externalAccountId],
      set: { ...values, updatedAt: sql`now()` },
    })
    .returning(publicColumns);
  return row;
}

/**
 * Decrypted tokens for server-side publishing jobs only.
 * Scoped by userId so one user can never load another's credentials.
 */
export async function getAccountTokens(userId: string, accountId: string) {
  const [row] = await getDb()
    .select()
    .from(connectedAccounts)
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, userId)))
    .limit(1);
  if (!row) return null;
  return { account: row, tokens: openTokens(row, row) };
}

/** Removes the account and its stored tokens. Returns false if it wasn't the user's. */
export async function deleteConnectedAccount(userId: string, accountId: string): Promise<boolean> {
  const deleted = await getDb()
    .delete(connectedAccounts)
    .where(and(eq(connectedAccounts.id, accountId), eq(connectedAccounts.userId, userId)))
    .returning({ id: connectedAccounts.id });
  return deleted.length > 0;
}
