import type { TargetMetrics } from "@/db/schema";
import type { PlatformId } from "@/lib/platforms";
import type { PostContent } from "./validation";

export type PublishTarget = {
  externalAccountId: string;
  handle: string | null;
  metadata: Record<string, unknown>;
};

export type PublishResult = { externalPostId: string; url?: string };

export type RefreshedTokens = { accessToken: string; refreshToken?: string | null; expiresAt?: Date | null };

export interface Publisher {
  platform: PlatformId;
  publish(target: PublishTarget, accessToken: string, content: PostContent): Promise<PublishResult>;
  /** Returns fresh tokens. Only implemented where the platform supports refresh. */
  refresh?(tokens: { accessToken: string; refreshToken: string | null }): Promise<RefreshedTokens>;
  /** Reads likes/comments/shares/views for a published post. Only where the platform's API allows it. */
  metrics?(target: PublishTarget, accessToken: string, externalPostId: string): Promise<TargetMetrics>;
}

/** Keeps only finite, non-negative numbers. */
export function cleanMetrics(m: Record<string, unknown>): TargetMetrics {
  const out: TargetMetrics = {};
  for (const k of ["likes", "comments", "shares", "views"] as const) {
    const v = Number(m[k]);
    if (m[k] !== undefined && m[k] !== null && Number.isFinite(v) && v >= 0) out[k] = Math.round(v);
  }
  return out;
}

/**
 * A failed publish. `retryable` failures (rate limits, outages) are tried again later;
 * `auth` failures mark the account as needing to be reconnected.
 */
export class PublishError extends Error {
  readonly retryable: boolean;
  readonly auth: boolean;
  constructor(message: string, opts: { retryable?: boolean; auth?: boolean } = {}) {
    super(message);
    this.name = "PublishError";
    this.retryable = opts.retryable ?? false;
    this.auth = opts.auth ?? false;
  }
}

type FetchLike = typeof fetch;
let fetchImpl: FetchLike = (...args) => fetch(...args);
/** Test hook: swap the HTTP client. */
export function setFetch(f: FetchLike) {
  fetchImpl = f;
}

/** Raw request through the swappable client (for downloading media). */
export const fetchRaw: FetchLike = (...args) => fetchImpl(...args);

/** JSON request that turns platform errors into PublishErrors with the right retry semantics. */
export async function requestJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit & { platformName: string },
): Promise<{ data: T; headers: Headers }> {
  let res: Response;
  try {
    res = await fetchImpl(url, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new PublishError(`${init.platformName} could not be reached (${err instanceof Error ? err.message : "network error"})`, { retryable: true });
  }
  const raw = await res.text();
  let data: unknown = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw.slice(0, 200) };
  }
  if (!res.ok) {
    const msg = extractMessage(data) ?? res.statusText;
    const text = `${init.platformName} error ${res.status}: ${msg}`;
    if (res.status === 401) throw new PublishError(text, { auth: true });
    if (res.status === 403 && /token|expired|permission|scope|authori/i.test(msg)) throw new PublishError(text, { auth: true });
    if (res.status === 429 || res.status >= 500) throw new PublishError(text, { retryable: true });
    throw new PublishError(text);
  }
  return { data: data as T, headers: res.headers };
}

function extractMessage(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const err = d.error as Record<string, unknown> | string | undefined;
  if (typeof err === "string") return (d.error_description as string) ?? err;
  if (err && typeof err.message === "string") return err.message;
  if (typeof d.detail === "string") return d.detail;
  if (typeof d.message === "string") return d.message;
  if (Array.isArray(d.errors) && d.errors[0]?.message) return String(d.errors[0].message);
  return undefined;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Appends media links to text for platforms where this integration posts text only. */
export function withMediaLinks(text: string, mediaUrls: string[]): string {
  return [text.trim(), ...mediaUrls].filter(Boolean).join("\n");
}
