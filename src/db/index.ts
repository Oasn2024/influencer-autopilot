import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { db?: Database };

function createDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false keeps this compatible with transaction-mode poolers (Neon, Supabase).
  return drizzle(postgres(url, { prepare: false, max: 5 }), { schema });
}

/** Lazily created so builds and tests don't need a database. */
export function getDb(): Database {
  globalForDb.db ??= createDb();
  return globalForDb.db;
}
