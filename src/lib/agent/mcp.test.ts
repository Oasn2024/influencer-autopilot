import { describe, expect, it } from "vitest";
import { z } from "zod";
import { handleMcpBody, handleMcpMessage, RPC, type McpContext } from "./mcp";
import type { AgentTool } from "./tools";

class Known extends Error {}

const echo: AgentTool = {
  name: "echo",
  title: "Echo",
  description: "Echoes",
  input: z.object({ text: z.string().min(1) }),
  annotations: { readOnlyHint: true },
  run: async (userId, a) => {
    const { text } = a as { text: string };
    if (text === "boom") throw new Known("nope");
    if (text === "crash") throw new Error("secret internals");
    return { userId, text };
  },
};

const ctx: McpContext = {
  userId: "user_1",
  tools: [echo],
  schemaFor: () => ({ type: "object", properties: { text: { type: "string" } } }),
  describeError: (e) => (e instanceof Known ? { message: e.message } : undefined),
};

const call = (method: string, params?: Record<string, unknown>, id: number | string = 1) => handleMcpMessage(ctx, { jsonrpc: "2.0", id, method, params });

describe("MCP server", () => {
  it("negotiates the protocol version", async () => {
    const r = (await call("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }))!;
    expect((r.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
    const r2 = (await call("initialize", { protocolVersion: "1999-01-01" }))!;
    expect((r2.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
    expect((r2.result as { capabilities: unknown }).capabilities).toEqual({ tools: { listChanged: false } });
  });

  it("ignores notifications and client responses", async () => {
    expect(await handleMcpMessage(ctx, { jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    expect(await handleMcpMessage(ctx, { jsonrpc: "2.0", id: 5, result: {} })).toBeNull();
    expect(await handleMcpBody(ctx, [{ jsonrpc: "2.0", method: "notifications/initialized" }])).toBeNull();
  });

  it("lists tools with schemas", async () => {
    const r = (await call("tools/list"))!;
    const tools = (r.result as { tools: { name: string; inputSchema: unknown }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(["echo"]);
    expect(tools[0].inputSchema).toMatchObject({ type: "object" });
  });

  it("runs a tool as the key's user", async () => {
    const r = (await call("tools/call", { name: "echo", arguments: { text: "hi" } }))!;
    expect(r.result).toMatchObject({ structuredContent: { userId: "user_1", text: "hi" } });
  });

  it("reports bad arguments, known errors and crashes as tool errors without leaking internals", async () => {
    const bad = (await call("tools/call", { name: "echo", arguments: { text: "" } }))!;
    expect(bad.result).toMatchObject({ isError: true });
    const known = (await call("tools/call", { name: "echo", arguments: { text: "boom" } }))!;
    expect(JSON.stringify(known.result)).toContain("nope");
    const crash = (await call("tools/call", { name: "echo", arguments: { text: "crash" } }))!;
    expect(JSON.stringify(crash.result)).not.toContain("secret internals");
  });

  it("returns JSON-RPC errors for unknown tools and methods", async () => {
    expect((await call("tools/call", { name: "nope" }))!.error?.code).toBe(RPC.invalidParams);
    expect((await call("does/not/exist"))!.error?.code).toBe(RPC.methodNotFound);
    expect((await handleMcpMessage(ctx, { id: 1, method: 3 }))!.error?.code).toBe(RPC.invalidRequest);
  });

  it("answers batches", async () => {
    const r = (await handleMcpBody(ctx, [
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "ping" },
    ])) as unknown[];
    expect(r).toHaveLength(2);
  });
});
