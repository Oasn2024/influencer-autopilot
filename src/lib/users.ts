import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";

/**
 * Returns the signed-in Clerk user id and makes sure a matching row exists
 * in our database (rows are created lazily on first authenticated request).
 * Returns null when nobody is signed in.
 */
export async function requireUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;
  await ensureUserRow(userId);
  return userId;
}

const knownUsers = new Set<string>();

async function ensureUserRow(userId: string) {
  if (knownUsers.has(userId)) return;
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  await getDb()
    .insert(users)
    .values({ id: userId, email })
    .onConflictDoUpdate({ target: users.id, set: { email, updatedAt: sql`now()` } });
  knownUsers.add(userId);
}
