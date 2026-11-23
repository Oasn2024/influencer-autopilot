import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { setMediaHostChecks } from "./media";
import { pickPrivacy, tiktokChunks, tiktokPublisher } from "./tiktok";
import { setFetch, PublishError } from "./types";
import { validateForPlatform } from "./validation";
import { youtubePublisher, youtubeTitleAndDescription } from "./youtube";

const MB = 1024 * 1024;
const target = { externalAccountId: "acct", handle: "@maria", metadata: {} };
const video = (size = 1000) => new Response(new Uint8Array(size), { headers: { "content-type": "video/mp4", "content-length": String(size) } });

beforeAll(() => setMediaHostChecks(false));
afterEach(() => setFetch((...args) => fetch(...args)));

describe("YouTube", () => {
  it("builds a title from the first line and strips angle brackets", () => {
    expect(youtubeTitleAndDescription("\n  My <best> bake  \nRecipe below")).toEqual({ title: "My best bake", description: "My best bake  \nRecipe below" });
    expect(youtubeTitleAndDescription("").title).toBe("New video");
    expect([...youtubeTitleAndDescription("x".repeat(300)).title]).toHaveLength(100);
  });

  it("uploads with a resumable session", async () => {
    const calls: { url: string; method?: string; headers: Headers; body?: unknown }[] = [];
    setFetch(async (url, init) => {
      const u = String(url);
      calls.push({ url: u, method: init?.method, headers: new Headers(init?.headers), body: init?.body });
      if (u.endsWith("clip.mp4")) return video(1234);
      if (u.includes("uploadType=resumable")) return new Response("{}", { headers: { location: "https://upload.example/session1" } });
      if (u === "https://upload.example/session1") return Response.json({ id: "vid123", status: { uploadStatus: "uploaded" } });
      throw new Error(`unexpected ${u}`);
    });
    const res = await youtubePublisher.publish(target, "tok", { text: "Concha day!\nFresh at 7am", mediaUrls: ["https://cdn.example.com/clip.mp4"] });
    expect(res).toEqual({ externalPostId: "vid123", url: "https://www.youtube.com/watch?v=vid123" });
    const init = calls[1];
    expect(init.headers.get("authorization")).toBe("Bearer tok");
    expect(init.headers.get("x-upload-content-length")).toBe("1234");
    expect(JSON.parse(String(init.body))).toMatchObject({ snippet: { title: "Concha day!" }, status: { privacyStatus: "public" } });
    expect(calls[2].method).toBe("PUT");
  });

  it("reads view, like and comment counts", async () => {
    setFetch(async () => Response.json({ items: [{ statistics: { viewCount: "10", likeCount: "3", commentCount: "1" } }] }));
    expect(await youtubePublisher.metrics!(target, "tok", "vid123")).toEqual({ views: 10, likes: 3, comments: 1 });
  });

  it("asks to reconnect when Google revokes the refresh token", async () => {
    setFetch(async () => Response.json({ error: "invalid_grant", error_description: "Token has been expired or revoked." }, { status: 400 }));
    const err = await youtubePublisher.refresh!({ accessToken: "a", refreshToken: "r" }).catch((e) => e);
    expect(err).toBeInstanceOf(PublishError);
    expect(err.auth).toBe(true);
  });
});

describe("TikTok", () => {
  it("chunks files the way TikTok requires", () => {
    expect(tiktokChunks(3 * MB)).toEqual({ chunkSize: 3 * MB, count: 1 });
    expect(tiktokChunks(25 * MB)).toEqual({ chunkSize: 10 * MB, count: 2 });
    expect(tiktokChunks(19 * MB)).toEqual({ chunkSize: 10 * MB, count: 1 });
  });

  it("picks the most public privacy TikTok allows", () => {
    expect(pickPrivacy(["SELF_ONLY", "PUBLIC_TO_EVERYONE"])).toBe("PUBLIC_TO_EVERYONE");
    expect(pickPrivacy(["SELF_ONLY", "FOLLOWER_OF_CREATOR"])).toBe("FOLLOWER_OF_CREATOR");
    expect(pickPrivacy([])).toBe("SELF_ONLY");
  });

  it("uploads in chunks, falls back to private for unaudited apps, and returns the public link", async () => {
    const inits: string[] = [];
    const ranges: string[] = [];
    let polls = 0;
    setFetch(async (url, init) => {
      const u = String(url);
      if (u.endsWith("/creator_info/query/")) return Response.json({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"], creator_username: "maria" }, error: { code: "ok" } });
      if (u.endsWith("clip.mp4")) return video(12 * MB);
      if (u.endsWith("/video/init/")) {
        const privacy = JSON.parse(String(init?.body)).post_info.privacy_level;
        inits.push(privacy);
        if (privacy === "PUBLIC_TO_EVERYONE") return Response.json({ error: { code: "unaudited_client_can_only_post_to_private_accounts", message: "Please review" } }, { status: 403 });
        return Response.json({ data: { publish_id: "p1", upload_url: "https://upload.tiktok.example/u1" }, error: { code: "ok" } });
      }
      if (u === "https://upload.tiktok.example/u1") {
        ranges.push(new Headers(init?.headers).get("content-range")!);
        return new Response(null, { status: 201 });
      }
      if (u.endsWith("/status/fetch/")) {
        polls++;
        return Response.json({ data: { status: "PUBLISH_COMPLETE", publicaly_available_post_id: [7311] }, error: { code: "ok" } });
      }
      throw new Error(`unexpected ${u}`);
    });
    const res = await tiktokPublisher.publish(target, "tok", { text: "Concha day!", mediaUrls: ["https://cdn.example.com/clip.mp4"] });
    expect(inits).toEqual(["PUBLIC_TO_EVERYONE", "SELF_ONLY"]);
    expect(ranges).toEqual([`bytes 0-${12 * MB - 1}/${12 * MB}`]);
    expect(polls).toBe(1);
    expect(res).toEqual({ externalPostId: "7311", url: "https://www.tiktok.com/@maria/video/7311" });
  });

  it("reports TikTok's failure reason", async () => {
    setFetch(async (url) => {
      const u = String(url);
      if (u.endsWith("/creator_info/query/")) return Response.json({ data: { privacy_level_options: ["SELF_ONLY"] }, error: { code: "ok" } });
      if (u.endsWith("clip.mp4")) return video(100);
      if (u.endsWith("/video/init/")) return Response.json({ data: { publish_id: "p1", upload_url: "https://upload.tiktok.example/u1" }, error: { code: "ok" } });
      if (u.startsWith("https://upload.tiktok.example")) return new Response(null, { status: 201 });
      return Response.json({ data: { status: "FAILED", fail_reason: "duration_check" }, error: { code: "ok" } });
    });
    await expect(tiktokPublisher.publish(target, "tok", { text: "x", mediaUrls: ["https://cdn.example.com/clip.mp4"] })).rejects.toThrow(/duration_check/);
  });

  it("refuses posts without exactly one video", () => {
    expect(validateForPlatform("tiktok", { text: "hi", mediaUrls: [] }).length).toBeGreaterThan(0);
    expect(validateForPlatform("tiktok", { text: "hi", mediaUrls: ["https://a.example/p.jpg"] }).map((i) => i.message).join()).toMatch(/video/);
    expect(validateForPlatform("youtube", { text: "hi", mediaUrls: ["https://a.example/v.mp4"] })).toEqual([]);
  });
});
