import { afterEach, describe, expect, it } from "vitest";
import { PublishError, setFetch } from "./types";
import { xPublisher } from "./x";

const target = { externalAccountId: "1", handle: "me", metadata: {} };
const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

afterEach(() => setFetch((...args) => fetch(...args)));

describe("xPublisher", () => {
  it("posts text with media links appended", async () => {
    let sent: { url: string; body: unknown; auth: string | null } | null = null;
    setFetch(async (url, init) => {
      sent = { url: String(url), body: JSON.parse(String(init?.body)), auth: new Headers(init?.headers).get("authorization") };
      return new Response(JSON.stringify({ data: { id: "123" } }), { status: 201 });
    });
    const res = await xPublisher.publish(target, "tok", { text: "Hello", mediaUrls: ["https://cdn.example.com/a.jpg"] });
    expect(res).toEqual({ externalPostId: "123", url: "https://x.com/i/web/status/123" });
    expect(sent!.url).toBe("https://api.x.com/2/tweets");
    expect(sent!.body).toEqual({ text: "Hello\nhttps://cdn.example.com/a.jpg" });
    expect(sent!.auth).toBe("Bearer tok");
  });

  it("marks 401 as an auth error", async () => {
    setFetch(respond(401, { title: "Unauthorized", detail: "Unauthorized" }));
    const err = await xPublisher.publish(target, "tok", { text: "Hi", mediaUrls: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err.auth).toBe(true);
    expect(err.retryable).toBe(false);
  });

  it("marks 429 and 5xx as retryable", async () => {
    for (const status of [429, 503]) {
      setFetch(respond(status, { detail: "slow down" }));
      const err = await xPublisher.publish(target, "tok", { text: "Hi", mediaUrls: [] }).catch((e) => e);
      expect(err.retryable).toBe(true);
    }
  });

  it("treats network failures as retryable", async () => {
    setFetch(async () => {
      throw new TypeError("fetch failed");
    });
    const err = await xPublisher.publish(target, "tok", { text: "Hi", mediaUrls: [] }).catch((e) => e);
    expect(err.retryable).toBe(true);
  });

  it("rejects duplicate content as non-retryable", async () => {
    setFetch(respond(403, { detail: "You are not allowed to create a Tweet with duplicate content." }));
    const err = await xPublisher.publish(target, "tok", { text: "Hi", mediaUrls: [] }).catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(err.auth).toBe(false);
  });
});
