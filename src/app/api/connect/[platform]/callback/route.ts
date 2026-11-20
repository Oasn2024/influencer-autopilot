import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { upsertConnectedAccount } from "@/lib/connected-accounts";
import { OAUTH_COOKIE, appOrigin, redirectUriFor, resolveProvider } from "@/lib/oauth/flow";
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
  if (url.searchParams.get("error")) return fail(`${provider.name} sign-in was canceled`);
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
    const res = NextResponse.redirect(back);
    res.cookies.delete({ name: OAUTH_COOKIE, path: "/api/connect" });
    return res;
  } catch (err) {
    console.error("oauth exchange failed", provider.id, err instanceof Error ? err.message : err);
    return fail(`${provider.name} connection failed. Please try again.`);
  }
}
