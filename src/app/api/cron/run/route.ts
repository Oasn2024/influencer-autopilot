import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshMetrics } from "@/lib/analytics";
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

/** Cron calls this: publish everything due, let autopilot fill empty slots, then refresh post stats. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const started = Date.now();
  const publishing = await runPublishingCycle({ limit: 50 });
  // Autopilot only if there's time left; drafts are for future slots, so they can wait a run.
  const autopilot = Date.now() - started < 120_000 ? await runAutopilot({ maxUsers: 20 }) : [];
  // Engagement stats are least urgent: read them with whatever time is left.
  const metrics = Date.now() - started < 180_000 ? await refreshMetrics({ limit: 40 }) : { checked: 0, updated: 0, failed: 0 };
  return NextResponse.json({
    publishing: { claimed: publishing.claimed, published: publishing.published, failed: publishing.failed },
    autopilot: { users: autopilot.length, drafted: autopilot.reduce((n, r) => n + r.created, 0) },
    metrics,
    ms: Date.now() - started,
  });
}
