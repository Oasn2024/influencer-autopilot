import { describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, retryDelayMs, rollupPostStatus } from "./status";

describe("retryDelayMs", () => {
  it("backs off exponentially then gives up", () => {
    expect([1, 2, 3, 4].map(retryDelayMs)).toEqual([60_000, 240_000, 960_000, 3_840_000]);
    expect(retryDelayMs(MAX_ATTEMPTS)).toBeNull();
  });
});

describe("rollupPostStatus", () => {
  it("is published when every target is", () => {
    expect(rollupPostStatus([{ status: "published" }, { status: "published" }])).toBe("published");
    expect(rollupPostStatus([{ status: "published" }, { status: "skipped" }])).toBe("published");
  });
  it("is partial when some failed for good", () => {
    expect(rollupPostStatus([{ status: "published" }, { status: "failed", nextAttemptAt: null }])).toBe("partial");
  });
  it("keeps going while a retry is planned", () => {
    expect(rollupPostStatus([{ status: "published" }, { status: "failed", nextAttemptAt: new Date() }])).toBe("publishing");
    expect(rollupPostStatus([{ status: "failed", nextAttemptAt: new Date() }])).toBe("scheduled");
  });
  it("is failed when nothing went out", () => {
    expect(rollupPostStatus([{ status: "failed" }, { status: "failed" }])).toBe("failed");
  });
  it("is publishing while any target is in flight", () => {
    expect(rollupPostStatus([{ status: "publishing" }, { status: "published" }])).toBe("publishing");
  });
});
