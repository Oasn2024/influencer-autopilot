import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "./api-keys";

describe("api keys", () => {
  it("generates unique prefixed keys and stores only a hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    expect(a.key).toMatch(/^iap_[A-Za-z0-9_-]{43}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.prefix).toBe(a.key.slice(0, 10));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).not.toContain(a.key.slice(4));
    expect(looksLikeApiKey(a.key)).toBe(true);
  });
  it("rejects things that aren't keys", () => {
    expect(looksLikeApiKey("sk_live_abc")).toBe(false);
    expect(looksLikeApiKey("iap_short")).toBe(false);
    expect(looksLikeApiKey(`iap_${"a".repeat(40)}!`)).toBe(false);
  });
});
