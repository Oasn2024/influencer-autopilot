import { NextResponse } from "next/server";
import { handleMcpBody, RPC } from "@/lib/agent/mcp";
import { AGENT_TOOLS, inputJsonSchema, ToolError } from "@/lib/agent/tools";
import { verifyApiKey } from "@/lib/api-keys";
import { appOrigin } from "@/lib/oauth/flow";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

const rpcFail = (status: number, code: number, message: string, headers?: Record<string, string>) =>
  NextResponse.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });

/**
 * MCP endpoint for the creator's own AI agent (Claude, ChatGPT, Cursor, n8n...).
 * Auth: `Authorization: Bearer iap_...` (an API key from the AI agents page). Stateless, JSON only.
 */
export async function POST(req: Request) {
  // Browsers send Origin; only our own site may call us from one (stops DNS-rebinding tricks).
  const origin = req.headers.get("origin");
  if (origin && origin !== appOrigin(req)) return rpcFail(403, RPC.invalidRequest, "Origin not allowed");

  const match = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  const userId = match ? await verifyApiKey(match[1]) : null;
  if (!userId) {
    return rpcFail(401, RPC.invalidRequest, "Missing or invalid API key. Create one on the AI agents page and send it as: Authorization: Bearer iap_...", {
      "WWW-Authenticate": 'Bearer realm="influencer-autopilot"',
    });
  }

  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) return rpcFail(413, RPC.invalidRequest, "Request too large");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return rpcFail(400, RPC.parseError, "Body must be JSON");
  }

  const result = await handleMcpBody(
    {
      userId,
      tools: AGENT_TOOLS,
      schemaFor: inputJsonSchema,
      describeError: (err) => (err instanceof ToolError ? { message: err.message, details: err.details } : undefined),
    },
    body,
  );
  if (result === null) return new Response(null, { status: 202 });
  return NextResponse.json(result);
}

/** No server-to-client stream: this server only answers requests. */
export function GET() {
  return new Response("This MCP server only accepts POST requests.", { status: 405, headers: { Allow: "POST" } });
}

export function DELETE() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
