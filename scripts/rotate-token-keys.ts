/**
 * Re-encrypts every connected-account token that was written with an older
 * key, using TOKEN_ENCRYPTION_CURRENT_KEY_ID. Safe to re-run.
 *
 *   npm run tokens:rotate
 *
 * Keep the old key in TOKEN_ENCRYPTION_KEYS until this reports 0 stale rows.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { connectedAccounts } from "../src/db/schema";
import { getKeyring, keyIdOf, reencryptIfStale } from "../src/lib/crypto/tokens";
import { tokenAad } from "../src/lib/connected-accounts/sealing";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const keyring = getKeyring();
  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client);

  const rows = await db.select().from(connectedAccounts);
  let updated = 0;
  for (const row of rows) {
    const stale = keyIdOf(row.accessTokenEnc) !== keyring.currentKeyId ||
      (row.refreshTokenEnc !== null && keyIdOf(row.refreshTokenEnc) !== keyring.currentKeyId);
    if (!stale) continue;
    const accessTokenEnc = reencryptIfStale(row.accessTokenEnc, tokenAad(row, "access"), keyring) ?? row.accessTokenEnc;
    const refreshTokenEnc = row.refreshTokenEnc
      ? reencryptIfStale(row.refreshTokenEnc, tokenAad(row, "refresh"), keyring) ?? row.refreshTokenEnc
      : null;
    await db.update(connectedAccounts).set({ accessTokenEnc, refreshTokenEnc }).where(eq(connectedAccounts.id, row.id));
    updated++;
  }
  console.log(`Checked ${rows.length} accounts, re-encrypted ${updated} under key "${keyring.currentKeyId}".`);
  await client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
