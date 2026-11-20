import { describe, expect, it } from "vitest";
import { buildDraftPrompt, fitToLimit, normalizeOption } from "./drafts";

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

describe("buildDraftPrompt studio options", () => {
  it("adds tone, goal, option count and repurpose source", () => {
    const p = buildDraftPrompt({ topic: "pricing", platforms: ["x"], tone: "playful", goal: "promote", count: 3, sourceText: "A long blog post about pricing." });
    expect(p).toContain("Tone: playful");
    expect(p).toContain("call to action");
    expect(p).toContain("Write 3 distinct option(s)");
    expect(p).toContain("<source>");
    expect(p).toContain("Focus: pricing");
  });
  it("clamps the option count to 1-3", () => {
    expect(buildDraftPrompt({ topic: "t", platforms: ["x"], count: 9 })).toContain("Write 3 distinct");
    expect(buildDraftPrompt({ topic: "t", platforms: ["x"], count: 0 })).toContain("Write 1 distinct");
  });
});

describe("normalizeOption", () => {
  it("keeps only requested platforms, fits limits and cleans hashtags", () => {
    const o = normalizeOption(
      {
        angle: " Tip ",
        hook: "Hook",
        body: "Body",
        variants: [
          { platform: "X", text: "a ".repeat(200) },
          { platform: "tiktok", text: "not requested" },
        ],
        hashtags: ["##baking", "#baking", "sour dough", "#"],
        imageIdea: "bread",
      },
      ["x"],
      "m",
    );
    expect(Object.keys(o.variants)).toEqual(["x"]);
    expect([...o.variants.x!].length).toBeLessThanOrEqual(280);
    expect(o.hashtags).toEqual(["#baking", "#sourdough"]);
    expect(o.angle).toBe("Tip");
  });
});
