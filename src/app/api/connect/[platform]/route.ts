import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { isProviderConfigured, pkcePair } from "@/lib/oauth/providers";
import { OAUTH_COOKIE, appOrigin, redirectUriFor, resolveProvider } from "@/lib/oauth/flow";
import { requireUserId } from "@/lib/users";

/** Starts OAuth: remembers state + PKCE verifier in a short-lived httpOnly cookie, then redirects. */
export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const userId = await requireUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { platform } = await ctx.params;
  const provider = resolveProvider(platform);
  const back = new URL("/dashboard/accounts", appOrigin(req));
  if (!provider || !isProviderConfigured(provider)) {
    back.searchParams.set("error", `${provider?.name ?? platform} isn't set up yet`);
    return NextResponse.redirect(back);
  }
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  const res = NextResponse.redirect(provider.authorizeUrl({ redirectUri: redirectUriFor(req, provider), state, codeChallenge: challenge }));
  res.cookies.set(OAUTH_COOKIE, JSON.stringify({ state, verifier, provider: provider.id, userId }), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/connect",
    maxAge: 600,
  });
  return res;
}
