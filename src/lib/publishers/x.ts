import { cleanMetrics, PublishError, requestJson, withMediaLinks, type Publisher } from "./types";

const API = "https://api.x.com/2";

export const xPublisher: Publisher = {
  platform: "x",
  async publish(_target, accessToken, content) {
    // Media upload needs X's separate chunked upload API; for now media links are included in the text.
    const { data } = await requestJson<{ data?: { id: string } }>(`${API}/tweets`, {
      platformName: "X",
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ text: withMediaLinks(content.text, content.mediaUrls) }),
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
