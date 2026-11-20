import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot/runner";
import { runPublishingCycle } from "@/lib/publishing/engine";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(req.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Vercel Cron calls this: publish everything due, then let autopilot fill empty slots. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const publishing = await runPublishingCycle({ limit: 50 });
  // Autopilot only if there's time left; drafts are for future slots, so they can wait a run.
  const autopilot = Date.now() - started < 120_000 ? await runAutopilot({ maxUsers: 20 }) : [];
  return NextResponse.json({
    publishing: { claimed: publishing.claimed, published: publishing.published, failed: publishing.failed },
    autopilot: { users: autopilot.length, drafted: autopilot.reduce((n, r) => n + r.created, 0) },
    ms: Date.now() - started,
  });
}
