import { describe, expect, it } from "vitest";
import { engagementOf, formatLearnedTime, learnBestTimes, summarize, toSlots, type MetricRow } from "./insights";

let i = 0;
const row = (o: Partial<MetricRow> & { at: string; likes?: number }): MetricRow => ({
  targetId: `t${++i}`,
  postId: `p${i}`,
  accountId: o.accountId ?? "a1",
  platform: o.platform ?? "x",
  body: "post",
  url: null,
  publishedAt: new Date(o.at),
  metrics: o.metrics === undefined ? { likes: o.likes ?? 0, comments: 0, shares: 0 } : o.metrics,
});

describe("summarize", () => {
  it("totals by platform, ranks top posts and skips posts without stats", () => {
    const s = summarize([
      row({ at: "2026-11-01T10:00:00Z", platform: "x", likes: 10 }),
      row({ at: "2026-11-02T10:00:00Z", platform: "linkedin", likes: 50 }),
      row({ at: "2026-11-03T10:00:00Z", platform: "x", metrics: null }),
      row({ at: "2026-11-03T10:00:00Z", platform: "x", metrics: { error: "no permission" } }),
    ]);
    expect(s.published).toBe(4);
    expect(s.measured).toBe(2);
    expect(s.totals.engagement).toBe(60);
    expect(s.platforms.map((p) => p.platform)).toEqual(["linkedin", "x"]);
    expect(s.top[0].platform).toBe("linkedin");
  });
  it("counts likes, comments and shares as interactions", () => {
    expect(engagementOf({ likes: 1, comments: 2, shares: 3, views: 100 })).toBe(6);
    expect(engagementOf(null)).toBe(0);
  });
});

describe("learnBestTimes", () => {
  it("needs enough posts before guessing", () => {
    expect(learnBestTimes([row({ at: "2026-11-02T09:00:00Z" })], "UTC")).toBeNull();
  });

  it("finds the slot that beats each account's usual results, in local time", () => {
    const rows = [
      // Tuesday 9am New York (14:00Z) does great on both accounts.
      row({ at: "2026-11-03T14:00:00Z", likes: 30 }),
      row({ at: "2026-11-10T14:05:00Z", likes: 34 }),
      row({ at: "2026-11-03T14:30:00Z", accountId: "big", platform: "linkedin", likes: 900 }),
      // Everything else is ordinary.
      ...["2026-11-04T20:00:00Z", "2026-11-05T20:00:00Z", "2026-11-06T20:00:00Z", "2026-11-07T20:00:00Z"].map((at) => row({ at, likes: 10 })),
      ...["2026-11-04T20:00:00Z", "2026-11-05T20:00:00Z"].map((at) => row({ at, accountId: "big", platform: "linkedin", likes: 300 })),
    ];
    const best = learnBestTimes(rows, "America/New_York")!;
    expect(best[0]).toMatchObject({ day: 2, hour: 9, posts: 3 });
    expect(best[0].lift).toBeGreaterThan(2);
    expect(formatLearnedTime(best[0])).toBe("Tue 9am");
    expect(toSlots(best).find((s) => s.day === 2)).toEqual({ day: 2, time: "09:00" });
  });
});
