import "server-only";
import { isPlatformId } from "@/lib/platforms";
import { OAUTH_PROVIDERS, providerForPlatform, type OAuthProvider, type OAuthProviderId } from "./providers";

export const OAUTH_COOKIE = "iap_oauth";

/** Accepts a platform id (facebook) or a provider id (meta). */
export function resolveProvider(id: string): OAuthProvider | undefined {
  if (id in OAUTH_PROVIDERS) return OAUTH_PROVIDERS[id as OAuthProviderId];
  return isPlatformId(id) ? providerForPlatform(id) : undefined;
}

export function appOrigin(req: Request): string {
  return (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}

/** Register exactly this URL in each platform's developer app. */
export function redirectUriFor(req: Request, provider: OAuthProvider): string {
  return `${appOrigin(req)}/api/connect/${provider.id}/callback`;
}
