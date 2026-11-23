import { describe, expect, it } from "vitest";
import { OAUTH_PROVIDERS, providerForPlatform } from "./providers";

describe("YouTube and TikTok sign-in", () => {
  it("asks Google for offline access with PKCE", () => {
    process.env.YOUTUBE_CLIENT_ID = "yt-id";
    const url = new URL(OAUTH_PROVIDERS.youtube.authorizeUrl({ redirectUri: "https://app.example/api/connect/youtube/callback", state: "s", codeChallenge: "c" }));
    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge")).toBe("c");
    expect(url.searchParams.get("scope")).toContain("youtube.upload");
  });

  it("sends TikTok its client key and posting scopes", () => {
    process.env.TIKTOK_CLIENT_KEY = "tt-key";
    const url = new URL(OAUTH_PROVIDERS.tiktok.authorizeUrl({ redirectUri: "https://app.example/api/connect/tiktok/callback", state: "s", codeChallenge: "c" }));
    expect(url.searchParams.get("client_key")).toBe("tt-key");
    expect(url.searchParams.get("scope")).toBe("user.info.basic,video.publish,video.list");
  });

  it("maps platforms to their providers", () => {
    expect(providerForPlatform("youtube")?.id).toBe("youtube");
    expect(providerForPlatform("tiktok")?.id).toBe("tiktok");
  });
});
