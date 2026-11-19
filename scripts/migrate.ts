/**
 * Applies pending Drizzle migrations. Runs automatically before each Vercel
 * build (see the `vercel-build` script) so the database schema always matches
 * the deployed code. Skips when DATABASE_URL is not set (e.g. CI).
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("DATABASE_URL not set; skipping migrations.");
    return;
  }
  const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "drizzle" });
  await client.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
