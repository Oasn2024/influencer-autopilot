import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertConnectedAccount } from "@/lib/connected-accounts";
import { OAUTH_COOKIE, appOrigin, redirectUriFor, resolveProvider } from "@/lib/oauth/flow";
import { ConnectError } from "@/lib/oauth/providers";
import { PublishError } from "@/lib/publishers/types";
import { PLATFORMS } from "@/lib/platforms";
import { logEvent } from "@/lib/publishing/events";
import { requireUserId } from "@/lib/users";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** OAuth callback: checks state, exchanges the code, and stores each account's tokens encrypted. */
export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const back = new URL("/dashboard/accounts", appOrigin(req));
  const fail = (message: string) => {
    back.searchParams.set("error", message);
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/connect" });
    return res;
  };
  const userId = await requireUserId();
  if (!userId) return fail("Please sign in again");
  const { platform } = await ctx.params;
  const provider = resolveProvider(platform);
  if (!provider) return fail("Unknown platform");

  const url = new URL(req.url);
  const oauthError = url.searchParams.get("error");
  if (oauthError) {
    const reason = url.searchParams.get("error_reason") ?? oauthError;
    if (/denied|cancel/i.test(reason)) return fail(`${provider.name} sign-in was canceled`);
    const detail = (url.searchParams.get("error_description") ?? reason).replace(/[^\w .,:'()/-]/g, " ").slice(0, 160);
    return fail(`${provider.name} refused the connection: ${detail}`);
  }
  let saved: { state?: string; verifier?: string; provider?: string; userId?: string } = {};
  try {
    saved = JSON.parse((await cookies()).get(OAUTH_COOKIE)?.value ?? "{}");
  } catch {}
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  if (!saved.state || !saved.verifier || saved.provider !== provider.id || saved.userId !== userId || !same(saved.state, state) || !code) {
    return fail("That sign-in link expired. Please try connecting again.");
  }

  try {
    const profiles = await provider.exchange({ code, redirectUri: redirectUriFor(req, provider), codeVerifier: saved.verifier });
    if (profiles.length === 0) return fail(`No ${provider.name} accounts or pages were found to connect`);
    for (const p of profiles) {
      const acct = await upsertConnectedAccount({
        userId,
        platform: p.platform,
        externalAccountId: p.externalAccountId,
        tokens: { accessToken: p.accessToken, refreshToken: p.refreshToken ?? null },
        tokenExpiresAt: p.expiresAt ?? null,
        scopes: p.scopes,
        displayName: p.displayName,
        handle: p.handle,
        avatarUrl: p.avatarUrl,
        metadata: p.metadata,
      });
      await logEvent({ userId, connectedAccountId: acct.id, type: "account.connected", message: `Connected ${PLATFORMS[p.platform].name}: ${p.displayName ?? p.handle ?? p.externalAccountId}` });
    }
    back.searchParams.set("connected", String(profiles.length));
    if (provider.id === "meta" && !profiles.some((p) => p.platform === "instagram")) {
      back.searchParams.set("note", "No Instagram account came with your Pages. To post to Instagram, make it a professional (Business or Creator) account, link it to your Facebook Page, then connect again.");
    }
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/connect" });
    return res;
  } catch (err) {
    console.error("oauth exchange failed", provider.id, err instanceof Error ? err.message : err);
    if (err instanceof ConnectError) return fail(err.message);
    // Platform errors (bad redirect URI, app not live, missing permission) are worth showing as-is.
    if (err instanceof PublishError) return fail(`${provider.name} connection failed: ${err.message.slice(0, 160)}`);
    return fail(`${provider.name} connection failed. Please try again.`);
  }
}
