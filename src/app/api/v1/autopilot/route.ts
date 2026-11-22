import { NextResponse } from "next/server";
import { withApiUser } from "@/lib/api/http";
import { agentBrief, getAutopilotSettings } from "@/lib/autopilot/runner";

/** GET /api/v1/autopilot: open posting times, target accounts, brand voice and topics, for your own AI agent to fill. */
export const GET = withApiUser(async (_req, userId) => {
  return NextResponse.json({ data: await agentBrief(await getAutopilotSettings(userId)) });
});
