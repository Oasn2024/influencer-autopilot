import { describe, expect, it } from "vitest";
import { bestTimeLabel, suggestedSlots } from "./best-times";
import { scorePost } from "./engagement";
import { resolveImageModel, resolveTextModel, DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL } from "./models";

describe("scorePost", () => {
  it("scores an empty post zero", () => {
    expect(scorePost({ text: "" }).score).toBe(0);
  });
  it("rewards a hook, a question, media and the right length", () => {
    const good = scorePost({
      platform: "x",
      hasMedia: true,
      text: "3 things I wish I knew before opening a bakery:\nStart small. Price for profit. Rest.\nWhich one surprised you?",
    });
    expect(good.score).toBeGreaterThanOrEqual(80);
    expect(good.grade).toBe("Great");
  });
  it("flags too many hashtags and links on Instagram", () => {
    const r = scorePost({ platform: "instagram", text: "nice day https://example.com #a" });
    expect(r.checks.find((c) => c.id === "links")?.ok).toBe(false);
    expect(r.checks.find((c) => c.id === "hashtags")?.ok).toBe(false);
    expect(r.grade).toBe("Needs work");
  });
});

describe("best times", () => {
  it("labels a platform's suggested times", () => {
    expect(bestTimeLabel("linkedin")).toBe("Tue–Thu at 08:30 or 12:00");
    expect(bestTimeLabel("whatsapp")).toBeNull();
  });
  it("suggests sorted weekly slots for the chosen platforms, capped", () => {
    const slots = suggestedSlots(["linkedin", "x", "facebook"], 4);
    expect(slots.length).toBe(4);
    expect(slots.map((s) => s.day)).toEqual([...slots.map((s) => s.day)].sort((a, b) => a - b));
    expect(new Set(slots.map((s) => s.time)).size).toBe(1);
  });
  it("falls back to Mon/Wed/Fri for platforms without data", () => {
    expect(suggestedSlots(["whatsapp"])).toEqual([1, 3, 5].map((day) => ({ day, time: "09:00" })));
  });
});

describe("model allow-list", () => {
  it("only allows listed models", () => {
    expect(resolveTextModel("openai/gpt-5.5")).toBe("openai/gpt-5.5");
    expect(resolveTextModel("some/expensive-model")).toBe(DEFAULT_TEXT_MODEL);
    expect(resolveTextModel(null, "anthropic/claude-haiku-5.5")).toBe("anthropic/claude-haiku-5.5");
    expect(resolveImageModel("bfl/flux-3-image")).toBe("bfl/flux-3-image");
    expect(resolveImageModel("nope")).toBe(DEFAULT_IMAGE_MODEL);
  });
});
