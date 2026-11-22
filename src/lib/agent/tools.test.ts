import { describe, expect, it } from "vitest";
import { AGENT_TOOLS, inputJsonSchema } from "./tools";

describe("agent tools", () => {
  it("have unique names and object JSON schemas", () => {
    const names = AGENT_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of AGENT_TOOLS) {
      const s = inputJsonSchema(t);
      expect(s.type).toBe("object");
      expect(s).not.toHaveProperty("$schema");
      expect(t.name).toMatch(/^[a-z_]{3,40}$/);
    }
  });

  it("validates create_post input", () => {
    const create = AGENT_TOOLS.find((t) => t.name === "create_post")!;
    expect(create.input.safeParse({ body: "hi", account_ids: [] }).success).toBe(false);
    expect(create.input.safeParse({ body: "hi", account_ids: ["4f0c9a3e-2f1b-4c7a-9d2e-1a2b3c4d5e6f"], mode: "approval" }).success).toBe(true);
    expect(create.input.safeParse({ body: "hi", account_ids: ["4f0c9a3e-2f1b-4c7a-9d2e-1a2b3c4d5e6f"], scheduled_at: "tomorrow" }).success).toBe(false);
    const schema = inputJsonSchema(create) as { required?: string[] };
    expect(schema.required).toEqual(expect.arrayContaining(["body", "account_ids"]));
  });
});
