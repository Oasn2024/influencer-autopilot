import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

/** Everything a webhook can subscribe to. */
export const WEBHOOK_EVENTS = [
  { id: "autopilot.slots_open", label: "Autopilot has open posting times for your agent to fill" },
  { id: "post.pending_approval", label: "A draft is waiting for your approval" },
  { id: "post.published", label: "A post went live everywhere" },
  { id: "post.partial", label: "A post went out on some accounts, not all" },
  { id: "post.failed", label: "A post failed" },
  { id: "account.expired", label: "An account needs reconnecting" },
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]["id"] | "webhook.test";
export const WEBHOOK_EVENT_IDS = WEBHOOK_EVENTS.map((e) => e.id) as [WebhookEventType, ...WebhookEventType[]];

export const generateWebhookSecret = () => `whsec_${randomBytes(24).toString("base64url")}`;

/**
 * Signature header, Stripe-style: `t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<body>">`.
 * Receivers recompute it with their secret and reject old timestamps to stop replays.
 */
export function signWebhook(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

/** Reference verifier (also used in tests and shown in the docs). */
export function verifyWebhookSignature(secret: string, body: string, header: string, toleranceSeconds = 300, now = Date.now()): boolean {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=", 2) as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = Buffer.from(signWebhook(secret, body, t).split("v1=")[1], "hex");
  const given = Buffer.from(parts.v1, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** True for loopback, private, link-local, CGNAT, multicast and other non-public addresses. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19))
    );
  }
  if (isIP(ip) === 6) {
    if (ip === "::" || ip === "::1") return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
    if (mapped) return isPrivateAddress(mapped[1]);
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(ip) || ip.startsWith("64:ff9b:") || ip.startsWith("2001:db8");
  }
  return false;
}

/** Checks the URL's shape before we ever store or call it. Returns an error message, or null when fine. */
export function webhookUrlProblem(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "Enter a full URL starting with https://";
  }
  if (url.protocol !== "https:") return "The URL must start with https://";
  if (url.username || url.password) return "Don't put a username or password in the URL";
  if (url.port && url.port !== "443") return "Use the standard https port";
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return "The URL must be reachable on the public internet";
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) && isPrivateAddress(host)) return "The URL must be reachable on the public internet";
  if (raw.length > 2000) return "That URL is too long";
  return null;
}
