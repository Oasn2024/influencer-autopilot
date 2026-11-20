import { isVideoUrl } from "./validation";
import { cleanMetrics, fetchRaw, PublishError, requestJson, withMediaLinks, type Publisher } from "./types";

const API = "https://api.x.com/2";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Uploads one image to X and returns its media id, or null if it can't be used natively. */
async function uploadImage(url: string, accessToken: string): Promise<string | null> {
  const res = await fetchRaw(url, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
  if (!res?.ok) return null;
  const type = res.headers.get("content-type")?.split(";")[0] ?? "";
  if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return null;
  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return null;
  const form = new FormData();
  form.set("media", new Blob([bytes], { type }), "image");
  form.set("media_category", type === "image/gif" ? "tweet_gif" : "tweet_image");
  const { data } = await requestJson<{ data?: { id?: string } }>(`${API}/media/upload`, {
    platformName: "X",
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  return data.data?.id ?? null;
}

export const xPublisher: Publisher = {
  platform: "x",
  async publish(_target, accessToken, content) {
    // Images are uploaded natively (up to 4). Videos, and any image X won't take
    // (too big, unsupported, or an older connection without media permission), go in as links.
    const mediaIds: string[] = [];
    const asLinks: string[] = [];
    for (const url of content.mediaUrls) {
      if (isVideoUrl(url) || mediaIds.length >= 4) {
        asLinks.push(url);
        continue;
      }
      const id = await uploadImage(url, accessToken).catch((err) => {
        if (err instanceof PublishError && err.retryable) throw err;
        return null;
      });
      if (id) mediaIds.push(id);
      else asLinks.push(url);
    }
    const { data } = await requestJson<{ data?: { id: string } }>(`${API}/tweets`, {
      platformName: "X",
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: withMediaLinks(content.text, asLinks), ...(mediaIds.length ? { media: { media_ids: mediaIds } } : {}) }),
    });
    if (!data.data?.id) throw new PublishError("X did not return a post id");
    return { externalPostId: data.data.id, url: `https://x.com/i/web/status/${data.data.id}` };
  },
  async metrics(_target, accessToken, id) {
    type Pm = { like_count?: number; reply_count?: number; retweet_count?: number; quote_count?: number; impression_count?: number };
    const { data } = await requestJson<{ data?: { public_metrics?: Pm } }>(`${API}/tweets/${encodeURIComponent(id)}?tweet.fields=public_metrics`, {
      platformName: "X",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const m = data.data?.public_metrics ?? {};
    return cleanMetrics({
      likes: m.like_count,
      comments: m.reply_count,
      shares: m.retweet_count === undefined && m.quote_count === undefined ? undefined : (m.retweet_count ?? 0) + (m.quote_count ?? 0),
      views: m.impression_count,
    });
  },
  async refresh({ refreshToken }) {
    if (!refreshToken) throw new PublishError("X session expired; reconnect the account", { auth: true });
    const id = process.env.X_CLIENT_ID ?? "";
    const secret = process.env.X_CLIENT_SECRET ?? "";
    const { data } = await requestJson<{ access_token: string; refresh_token?: string; expires_in?: number }>(`${API}/oauth2/token`, {
      platformName: "X",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: id }),
    });
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : null,
    };
  },
};
