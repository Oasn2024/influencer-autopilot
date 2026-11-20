import { describe, expect, it } from "vitest";
import { captionFor, validateForPlatform } from "./validation";

describe("validateForPlatform", () => {
  it("enforces X's 280 limit, counting links as 23", () => {
    expect(validateForPlatform("x", { text: "a".repeat(280), mediaUrls: [] })).toEqual([]);
    expect(validateForPlatform("x", { text: "a".repeat(281), mediaUrls: [] })).toHaveLength(1);
    const withLink = `${"a".repeat(250)} https://example.com/${"x".repeat(100)}`;
    expect(validateForPlatform("x", { text: withLink, mediaUrls: [] })).toEqual([]);
  });
  it("requires media on Instagram", () => {
    expect(validateForPlatform("instagram", { text: "hi", mediaUrls: [] })[0].message).toMatch(/image or video/);
    expect(validateForPlatform("instagram", { text: "hi", mediaUrls: ["https://cdn.example.com/a.jpg"] })).toEqual([]);
  });
  it("requires https media and some content", () => {
    expect(validateForPlatform("facebook", { text: "", mediaUrls: [] })[0].message).toMatch(/Add some text/);
    expect(validateForPlatform("facebook", { text: "hi", mediaUrls: ["http://insecure.example.com/a.jpg"] })).toHaveLength(1);
  });
});

describe("captionFor", () => {
  it("prefers a non-empty override", () => {
    expect(captionFor("main", "short")).toBe("short");
    expect(captionFor("main", "  ")).toBe("main");
    expect(captionFor("main", null)).toBe("main");
  });
});
