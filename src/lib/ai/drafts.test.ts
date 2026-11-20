import { describe, expect, it } from "vitest";
import { buildDraftPrompt, fitToLimit } from "./drafts";

describe("fitToLimit", () => {
  it("leaves short text alone", () => {
    expect(fitToLimit("x", "hello")).toBe("hello");
  });
  it("trims long text under the platform limit on a word boundary", () => {
    const long = "word ".repeat(100).trim();
    const out = fitToLimit("x", long);
    expect([...out].length).toBeLessThanOrEqual(280);
    expect(out.endsWith("…")).toBe(true);
    expect(out).not.toMatch(/wor…$/);
  });
});

describe("buildDraftPrompt", () => {
  it("includes voice, topic and each platform's limit", () => {
    const p = buildDraftPrompt({ topic: "Saturday market", brandVoice: "Friendly baker", platforms: ["x", "linkedin"] });
    expect(p).toContain("Friendly baker");
    expect(p).toContain("Saturday market");
    expect(p).toContain("max 280 characters");
    expect(p).toContain("max 3000 characters");
  });
});
