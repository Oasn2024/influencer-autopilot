import { z } from "zod";
import type { AgentTool } from "./tools";

/**
 * A small, stateless MCP server (Streamable HTTP transport, JSON responses only).
 * Each POST carries one JSON-RPC message or a batch; there are no sessions or server-sent streams,
 * which keeps it simple to run on serverless functions.
 */
export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "influencer-autopilot", title: "Influencer Autopilot", version: "1.0.0" };

export const SERVER_INSTRUCTIONS = [
  "You are helping a creator run their social media through Influencer Autopilot.",
  "Call get_autopilot_brief first: it lists open posting times, the accounts to post to, and the creator's voice and topics.",
  "Write posts in that voice, then call create_post for each open time. Accounts marked needs_media (Instagram) need a public image or video URL.",
  "Respect require_approval: leave mode unset so posts wait for the creator's OK. Don't publish or approve unless the creator asked you to.",
].join(" ");

type JsonRpcId = string | number | null;
type JsonRpcResponse = { jsonrpc: "2.0"; id: JsonRpcId; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const requestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
});

export const RPC = { parseError: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603 } as const;

const rpcError = (id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message, ...(data === undefined ? {} : { data }) },
});

export type McpContext = {
  userId: string;
  tools: AgentTool[];
  schemaFor(t: AgentTool): Record<string, unknown>;
  /** Turns a thrown error into a message safe to show the agent; undefined means "internal error". */
  describeError(err: unknown): { message: string; details?: unknown } | undefined;
};

/** Handles one JSON-RPC message. Returns null for notifications and responses (nothing to send back). */
export async function handleMcpMessage(ctx: McpContext, raw: unknown): Promise<JsonRpcResponse | null> {
  const parsed = requestSchema.safeParse(raw);
  if (!parsed.success) {
    // A client sending us a response or a malformed notification: nothing to answer.
    if (raw && typeof raw === "object" && !("method" in raw)) return null;
    const id = raw && typeof raw === "object" && "id" in raw ? ((raw as { id: JsonRpcId }).id ?? null) : null;
    return rpcError(id, RPC.invalidRequest, "Invalid JSON-RPC request");
  }
  const { id, method, params = {} } = parsed.data;
  if (id === undefined) return null; // notification, e.g. notifications/initialized

  switch (method) {
    case "initialize": {
      const asked = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOL_VERSIONS[0];
      return {
        jsonrpc: "2.0",
        id,
        result: { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS },
      };
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: ctx.tools.map((t) => ({ name: t.name, title: t.title, description: t.description, inputSchema: ctx.schemaFor(t), annotations: { title: t.title, ...t.annotations } })),
        },
      };
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const t = ctx.tools.find((x) => x.name === name);
      if (!t) return rpcError(id, RPC.invalidParams, `Unknown tool: ${name}`);
      const args = t.input.safeParse(params.arguments ?? {});
      if (!args.success) {
        const issues = args.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`);
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: `Invalid arguments. ${issues.join("; ")}` }] } };
      }
      try {
        const data = await t.run(ctx.userId, args.data);
        const structured = data !== null && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : { result: data };
        return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: structured } };
      } catch (err) {
        const known = ctx.describeError(err);
        if (!known) {
          console.error("mcp tool failed", name, err);
          return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text: "Something went wrong running that tool. Try again shortly." }] } };
        }
        const text = known.details ? `${known.message}\n${JSON.stringify(known.details, null, 2)}` : known.message;
        return { jsonrpc: "2.0", id, result: { isError: true, content: [{ type: "text", text }] } };
      }
    }
    case "resources/list":
      return { jsonrpc: "2.0", id, result: { resources: [] } };
    case "prompts/list":
      return { jsonrpc: "2.0", id, result: { prompts: [] } };
    default:
      return rpcError(id, RPC.methodNotFound, `Method not found: ${method}`);
  }
}

/** Handles a POST body: one message or a batch. Returns null when there's nothing to send (202). */
export async function handleMcpBody(ctx: McpContext, body: unknown): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(body)) {
    if (body.length === 0) return rpcError(null, RPC.invalidRequest, "Empty batch");
    const out = (await Promise.all(body.slice(0, 20).map((m) => handleMcpMessage(ctx, m)))).filter((r): r is JsonRpcResponse => r !== null);
    return out.length ? out : null;
  }
  return handleMcpMessage(ctx, body);
}
