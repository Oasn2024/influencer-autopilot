import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setMediaHostChecks } from "./media";
import { PublishError, setFetch } from "./types";
import { xPublisher } from "./x";

const target = { externalAccountId: "1", handle: "me", metadata: {} };
const respond = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

beforeAll(() => setMediaHostChecks(false));
afterEach(() => setFetch((...args) => fetch(...args)));

describe("xPublisher", () => {
  it("uploads images natively and keeps videos as links", async () => {
    const calls: string[] = [];
    let tweet: Record<string, unknown> | null = null;
    let auth: string | null = null;
    setFetch(async (url, init) => {
      const u = String(url);
      calls.push(u);
      if (u === "https://cdn.example.com/a.jpg") return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      if (u.endsWith("/media/upload")) {
        expect(init?.body).toBeInstanceOf(FormData);
        return Response.json({ data: { id: "m1" } });
      }
      tweet = JSON.parse(String(init?.body));
      auth = new Headers(init?.headers).get("authorization");
      return Response.json({ data: { id: "123" } }, { status: 201 });
    });
    const res = await xPublisher.publish(target, "tok", { text: "Hello", mediaUrls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/v.mp4"] });
    expect(res).toEqual({ externalPostId: "123", url: "https://x.com/i/web/status/123" });
    expect(calls).toEqual(["https://cdn.example.com/a.jpg", "https://api.x.com/2/media/upload", "https://api.x.com/2/tweets"]);
    expect(tweet).toEqual({ text: "Hello\nhttps://cdn.example.com/v.mp4", media: { media_ids: ["m1"] } });
    expect(auth).toBe("Bearer tok");
  });

  it("falls back to a link when X refuses the image upload", async () => {
    let tweet: Record<string, unknown> | null = null;
    setFetch(async (url, init) => {
      const u = String(url);
      if (u.endsWith(".png")) return new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } });
      if (u.endsWith("/media/upload")) return Response.json({ detail: "Forbidden: missing media.write" }, { status: 403 });
      tweet = JSON.parse(String(init?.body));
      return Response.json({ data: { id: "9" } });
    });
    await xPublisher.publish(target, "tok", { text: "Hi", mediaUrls: ["https://cdn.example.com/p.png"] }).catch(() => null);
    expect(tweet).toEqual({ text: "Hi\nhttps://cdn.example.com/p.png" });
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
