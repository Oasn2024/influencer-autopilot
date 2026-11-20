import { afterEach, describe, expect, it } from "vitest";
import { facebookPublisher, instagramPublisher, readInsights, threadsPublisher } from "./meta";
import { cleanMetrics, setFetch } from "./types";
import { xPublisher } from "./x";

const target = { externalAccountId: "1", handle: "me", metadata: {} };
afterEach(() => setFetch((...args) => fetch(...args)));

describe("cleanMetrics", () => {
  it("keeps non-negative numbers and drops the rest", () => {
    expect(cleanMetrics({ likes: 3.4, comments: -1, shares: "7", views: undefined, other: 9 })).toEqual({ likes: 3, shares: 7 });
  });
});

describe("readInsights", () => {
  it("reads both values[] and total_value shapes", () => {
    expect(readInsights({ data: [{ name: "views", values: [{ value: 10 }] }, { name: "likes", total_value: { value: 4 } }] })).toEqual({ views: 10, likes: 4 });
  });
});

describe("platform metrics", () => {
  it("X maps public_metrics", async () => {
    let url = "";
    setFetch(async (u) => {
      url = String(u);
      return Response.json({ data: { public_metrics: { like_count: 5, reply_count: 2, retweet_count: 1, quote_count: 1, impression_count: 300 } } });
    });
    expect(await xPublisher.metrics!(target, "tok", "99")).toEqual({ likes: 5, comments: 2, shares: 2, views: 300 });
    expect(url).toContain("/tweets/99?tweet.fields=public_metrics");
  });

  it("Threads maps insights", async () => {
    setFetch(async () =>
      Response.json({ data: [{ name: "views", values: [{ value: 120 }] }, { name: "likes", values: [{ value: 8 }] }, { name: "replies", values: [{ value: 3 }] }, { name: "reposts", values: [{ value: 1 }] }] }),
    );
    expect(await threadsPublisher.metrics!(target, "tok", "7")).toEqual({ likes: 8, comments: 3, shares: 1, views: 120 });
  });

  it("Facebook reads reaction, comment and share counts", async () => {
    setFetch(async () => Response.json({ reactions: { summary: { total_count: 12 } }, comments: { summary: { total_count: 4 } } }));
    expect(await facebookPublisher.metrics!(target, "tok", "1_2")).toEqual({ likes: 12, comments: 4, shares: 0 });
  });

  it("Instagram still returns likes and comments when insights aren't permitted", async () => {
    setFetch(async (u) =>
      String(u).includes("/insights")
        ? Response.json({ error: { message: "(#10) Application does not have permission" } }, { status: 403 })
        : Response.json({ like_count: 40, comments_count: 6 }),
    );
    expect(await instagramPublisher.metrics!(target, "tok", "m1")).toEqual({ likes: 40, comments: 6 });
  });
});
