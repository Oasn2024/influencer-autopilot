import { createHash, randomBytes } from "node:crypto";
import type { PlatformId } from "@/lib/platforms";
import { graphVersion } from "@/lib/publishers/meta";
import { requestJson } from "@/lib/publishers/types";

/** One account to save after a successful OAuth callback (Meta can return several pages). */
export type ConnectedProfile = {
  platform: PlatformId;
  externalAccountId: string;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes: string[];
  metadata?: Record<string, unknown>;
};

/** A connection problem with a message that's safe and useful to show the user. */
export class ConnectError extends Error {}

export type OAuthProviderId = "x" | "linkedin" | "threads" | "meta" | "youtube" | "tiktok";

export type OAuthProvider = {
  id: OAuthProviderId;
  name: string;
  platforms: PlatformId[];
  envVars: [string, string];
  usesPkce: boolean;
  authorizeUrl(p: { redirectUri: string; state: string; codeChallenge: string }): string;
  exchange(p: { code: string; redirectUri: string; codeVerifier: string }): Promise<ConnectedProfile[]>;
};

const env = (k: string) => process.env[k] ?? "";
const expiry = (seconds?: number) => (seconds ? new Date(Date.now() + seconds * 1000) : null);
const qs = (params: Record<string, string>) => new URLSearchParams(params).toString();

const X_SCOPES = ["tweet.read", "tweet.write", "users.read", "media.write", "offline.access"];
const LINKEDIN_SCOPES = ["openid", "profile", "w_member_social"];
const THREADS_SCOPES = ["threads_basic", "threads_content_publish", "threads_manage_insights"];
const YOUTUBE_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];
const TIKTOK_SCOPES = ["user.info.basic", "video.publish", "video.list"];
const META_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "business_management",
];

const x: OAuthProvider = {
  id: "x",
  name: "X",
  platforms: ["x"],
  envVars: ["X_CLIENT_ID", "X_CLIENT_SECRET"],
  usesPkce: true,
  authorizeUrl: ({ redirectUri, state, codeChallenge }) =>
    `https://x.com/i/oauth2/authorize?${qs({
      response_type: "code",
      client_id: env("X_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: X_SCOPES.join(" "),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })}`,
  async exchange({ code, redirectUri, codeVerifier }) {
    const basic = Buffer.from(`${env("X_CLIENT_ID")}:${env("X_CLIENT_SECRET")}`).toString("base64");
    const { data: tok } = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(
      "https://api.x.com/2/oauth2/token",
      {
        platformName: "X",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${basic}` },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          client_id: env("X_CLIENT_ID"),
        }),
      },
    );
    const { data: me } = await requestJson<{ data: { id: string; name: string; username: string; profile_image_url?: string } }>(
      "https://api.x.com/2/users/me?user.fields=profile_image_url",
      { platformName: "X", headers: { Authorization: `Bearer ${tok.access_token}` } },
    );
    return [
      {
        platform: "x",
        externalAccountId: me.data.id,
        displayName: me.data.name,
        handle: `@${me.data.username}`,
        avatarUrl: me.data.profile_image_url ?? null,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? null,
        expiresAt: expiry(tok.expires_in),
        scopes: tok.scope?.split(" ") ?? X_SCOPES,
      },
    ];
  },
};

const linkedin: OAuthProvider = {
  id: "linkedin",
  name: "LinkedIn",
  platforms: ["linkedin"],
  envVars: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
  usesPkce: false,
  authorizeUrl: ({ redirectUri, state }) =>
    `https://www.linkedin.com/oauth/v2/authorization?${qs({
      response_type: "code",
      client_id: env("LINKEDIN_CLIENT_ID"),
      redirect_uri: redirectUri,
      scope: LINKEDIN_SCOPES.join(" "),
      state,
    })}`,
  async exchange({ code, redirectUri }) {
    const { data: tok } = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        platformName: "LinkedIn",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: env("LINKEDIN_CLIENT_ID"),
          client_secret: env("LINKEDIN_CLIENT_SECRET"),
        }),
      },
    );
    const { data: me } = await requestJson<{ sub: string; name?: string; picture?: string }>("https://api.linkedin.com/v2/userinfo", {
      platformName: "LinkedIn",
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    return [
      {
        platform: "linkedin",
        externalAccountId: me.sub,
        displayName: me.name ?? null,
        handle: me.name ?? null,
        avatarUrl: me.picture ?? null,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? null,
        expiresAt: expiry(tok.expires_in),
        scopes: tok.scope?.split(/[ ,]/) ?? LINKEDIN_SCOPES,
      },
    ];
  },
};

const threads: OAuthProvider = {
  id: "threads",
  name: "Threads",
  platforms: ["threads"],
  envVars: ["THREADS_APP_ID", "THREADS_APP_SECRET"],
  usesPkce: false,
  authorizeUrl: ({ redirectUri, state }) =>
    `https://threads.net/oauth/authorize?${qs({
      client_id: env("THREADS_APP_ID"),
      redirect_uri: redirectUri,
      scope: THREADS_SCOPES.join(","),
      response_type: "code",
      state,
    })}`,
  async exchange({ code, redirectUri }) {
    const { data: short } = await requestJson<{ access_token: string; user_id: string | number }>(
      "https://graph.threads.net/oauth/access_token",
      {
        platformName: "Threads",
        method: "POST",
        body: new URLSearchParams({
          client_id: env("THREADS_APP_ID"),
          client_secret: env("THREADS_APP_SECRET"),
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
          code,
        }),
      },
    );
    const { data: long } = await requestJson<{ access_token: string; expires_in: number }>(
      `https://graph.threads.net/access_token?${qs({
        grant_type: "th_exchange_token",
        client_secret: env("THREADS_APP_SECRET"),
        access_token: short.access_token,
      })}`,
      { platformName: "Threads" },
    );
    const { data: me } = await requestJson<{ id: string; username?: string; threads_profile_picture_url?: string }>(
      `https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=${encodeURIComponent(long.access_token)}`,
      { platformName: "Threads" },
    );
    return [
      {
        platform: "threads",
        externalAccountId: String(me.id ?? short.user_id),
        displayName: me.username ?? null,
        handle: me.username ? `@${me.username}` : null,
        avatarUrl: me.threads_profile_picture_url ?? null,
        accessToken: long.access_token,
        expiresAt: expiry(long.expires_in),
        scopes: THREADS_SCOPES,
      },
    ];
  },
};

type MetaPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string; profile_picture_url?: string };
};

/** Explains why Meta gave us no Pages, from the permissions the person granted or declined. */
export function metaNoPagesMessage(perms: { permission: string; status: string }[]): string {
  const declined = perms.filter((p) => p.status !== "granted").map((p) => p.permission);
  if (declined.includes("pages_show_list") || declined.includes("pages_manage_posts")) {
    return "Facebook didn't share your Pages. Connect again, choose Edit settings, and allow access to your Page and its posts.";
  }
  return "No Facebook Pages came back. You need to be an admin of a Facebook Page, and pick it when Facebook asks which Pages to share. Instagram must be a professional account linked to that Page.";
}

const meta: OAuthProvider = {
  id: "meta",
  name: "Facebook & Instagram",
  platforms: ["facebook", "instagram"],
  envVars: ["META_APP_ID", "META_APP_SECRET"],
  usesPkce: false,
  authorizeUrl: ({ redirectUri, state }) =>
    `https://www.facebook.com/${graphVersion()}/dialog/oauth?${qs({
      client_id: env("META_APP_ID"),
      redirect_uri: redirectUri,
      // Apps made with "Facebook Login for Business" use a configuration (set META_CONFIG_ID) instead of a scope list.
      ...(env("META_CONFIG_ID") ? { config_id: env("META_CONFIG_ID"), override_default_response_type: "true" } : { scope: META_SCOPES.join(",") }),
      response_type: "code",
      state,
    })}`,
  async exchange({ code, redirectUri }) {
    const g = (path: string) => `https://graph.facebook.com/${graphVersion()}${path}`;
    const { data: short } = await requestJson<{ access_token: string }>(
      g(`/oauth/access_token?${qs({ client_id: env("META_APP_ID"), client_secret: env("META_APP_SECRET"), redirect_uri: redirectUri, code })}`),
      { platformName: "Facebook" },
    );
    // A long-lived user token makes the page tokens below non-expiring.
    const { data: long } = await requestJson<{ access_token: string }>(
      g(`/oauth/access_token?${qs({
        grant_type: "fb_exchange_token",
        client_id: env("META_APP_ID"),
        client_secret: env("META_APP_SECRET"),
        fb_exchange_token: short.access_token,
      })}`),
      { platformName: "Facebook" },
    );
    const { data: pages } = await requestJson<{ data: MetaPage[] }>(
      g(`/me/accounts?fields=id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}&limit=100&access_token=${encodeURIComponent(long.access_token)}`),
      { platformName: "Facebook" },
    );
    if (!pages.data?.length) {
      const { data: perms } = await requestJson<{ data?: { permission: string; status: string }[] }>(
        g(`/me/permissions?access_token=${encodeURIComponent(long.access_token)}`),
        { platformName: "Facebook" },
      ).catch(() => ({ data: { data: [] } }));
      throw new ConnectError(metaNoPagesMessage(perms.data ?? []));
    }
    const out: ConnectedProfile[] = [];
    for (const page of pages.data ?? []) {
      out.push({
        platform: "facebook",
        externalAccountId: page.id,
        displayName: page.name,
        handle: page.name,
        avatarUrl: page.picture?.data?.url ?? null,
        accessToken: page.access_token,
        scopes: META_SCOPES,
        metadata: { kind: "page" },
      });
      const ig = page.instagram_business_account;
      if (ig) {
        out.push({
          platform: "instagram",
          externalAccountId: ig.id,
          displayName: ig.username ?? page.name,
          handle: ig.username ? `@${ig.username}` : null,
          avatarUrl: ig.profile_picture_url ?? null,
          accessToken: page.access_token,
          scopes: META_SCOPES,
          metadata: { kind: "instagram_business", facebookPageId: page.id },
        });
      }
    }
    return out;
  },
};

const youtube: OAuthProvider = {
  id: "youtube",
  name: "YouTube",
  platforms: ["youtube"],
  envVars: ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
  usesPkce: true,
  authorizeUrl: ({ redirectUri, state, codeChallenge }) =>
    `https://accounts.google.com/o/oauth2/v2/auth?${qs({
      client_id: env("YOUTUBE_CLIENT_ID"),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: YOUTUBE_SCOPES.join(" "),
      // offline + consent makes Google return a refresh token every time, so uploads keep working.
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    })}`,
  async exchange({ code, redirectUri, codeVerifier }) {
    const { data: tok } = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number; scope?: string }>(
      "https://oauth2.googleapis.com/token",
      {
        platformName: "YouTube",
        method: "POST",
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
          client_id: env("YOUTUBE_CLIENT_ID"),
          client_secret: env("YOUTUBE_CLIENT_SECRET"),
          code_verifier: codeVerifier,
        }),
      },
    );
    const scopes = tok.scope?.split(" ") ?? YOUTUBE_SCOPES;
    if (!scopes.includes(YOUTUBE_SCOPES[0])) throw new ConnectError("YouTube didn't give permission to upload videos. Connect again and tick every box Google shows.");
    type Channel = { id: string; snippet?: { title?: string; customUrl?: string; thumbnails?: { default?: { url?: string } } } };
    const { data: ch } = await requestJson<{ items?: Channel[] }>("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      platformName: "YouTube",
      headers: { Authorization: `Bearer ${tok.access_token}` },
    });
    if (!ch.items?.length) throw new ConnectError("That Google account has no YouTube channel yet. Create one at youtube.com, then connect again.");
    return ch.items.map((c) => ({
      platform: "youtube" as const,
      externalAccountId: c.id,
      displayName: c.snippet?.title ?? null,
      handle: c.snippet?.customUrl ?? null,
      avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token ?? null,
      expiresAt: expiry(tok.expires_in),
      scopes,
    }));
  },
};

const tiktok: OAuthProvider = {
  id: "tiktok",
  name: "TikTok",
  platforms: ["tiktok"],
  envVars: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
  usesPkce: false,
  authorizeUrl: ({ redirectUri, state }) =>
    `https://www.tiktok.com/v2/auth/authorize/?${qs({
      client_key: env("TIKTOK_CLIENT_KEY"),
      response_type: "code",
      scope: TIKTOK_SCOPES.join(","),
      redirect_uri: redirectUri,
      state,
    })}`,
  async exchange({ code, redirectUri }) {
    const { data: tok } = await requestJson<{
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    }>("https://open.tiktokapis.com/v2/oauth/token/", {
      platformName: "TikTok",
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: env("TIKTOK_CLIENT_KEY"),
        client_secret: env("TIKTOK_CLIENT_SECRET"),
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    if (!tok.access_token || !tok.open_id) throw new ConnectError(`TikTok sign-in failed: ${tok.error_description ?? tok.error ?? "no token returned"}`);
    const scopes = tok.scope?.split(",") ?? TIKTOK_SCOPES;
    if (!scopes.includes("video.publish")) throw new ConnectError("TikTok didn't give permission to post videos. Connect again and allow posting.");
    const { data: me } = await requestJson<{ data?: { user?: { open_id?: string; display_name?: string; username?: string; avatar_url?: string } } }>(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,username,avatar_url",
      { platformName: "TikTok", headers: { Authorization: `Bearer ${tok.access_token}` } },
    ).catch(() => ({ data: {} as { data?: { user?: Record<string, string> } } }));
    const user = me.data?.user ?? {};
    return [
      {
        platform: "tiktok",
        externalAccountId: tok.open_id,
        displayName: user.display_name ?? user.username ?? null,
        handle: user.username ? `@${user.username}` : null,
        avatarUrl: user.avatar_url ?? null,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token ?? null,
        expiresAt: expiry(tok.expires_in),
        scopes,
      },
    ];
  },
};

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProvider> = { x, linkedin, threads, meta, youtube, tiktok };

/** Which OAuth app connects a platform. */
export function providerForPlatform(platform: PlatformId): OAuthProvider | undefined {
  return Object.values(OAUTH_PROVIDERS).find((p) => p.platforms.includes(platform));
}

export function isProviderConfigured(p: OAuthProvider): boolean {
  return p.envVars.every((k) => Boolean(process.env[k]));
}

export function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}
