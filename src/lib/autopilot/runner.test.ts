import { describe, expect, it } from "vitest";
import { pickTopic } from "./runner";

describe("pickTopic", () => {
  it("uses a topic that hasn't been used recently first", () => {
    expect(pickTopic(["a", "b", "c"], ["a", "b"])).toBe("c");
  });
  it("falls back to the least recently used", () => {
    expect(pickTopic(["a", "b"], ["b", "a", "b"])).toBe("a");
  });
  it("has a default when no topics are set", () => {
    expect(pickTopic([], [])).toMatch(/audience/);
  });
});
