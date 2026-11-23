import { downloadMedia } from "./media";
import { isVideoUrl } from "./validation";
import { cleanMetrics, PublishError, requestJson, type Publisher } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";
export const maxVideoBytes = () => Math.max(1, Number(process.env.MAX_VIDEO_MB) || 200) * 1024 * 1024;

const PRIVACY = ["public", "unlisted", "private"] as const;
const privacy = () => {
  const p = process.env.YOUTUBE_PRIVACY as (typeof PRIVACY)[number] | undefined;
  return p && PRIVACY.includes(p) ? p : "public";
};

/** YouTube rejects < and > in titles and descriptions. */
const clean = (s: string) => s.replace(/[<>]/g, "").trim();

/** Title is the post's first line (max 100 chars); the description is the whole post (max 5000). */
export function youtubeTitleAndDescription(text: string) {
  const firstLine = clean(text.split("\n").find((l) => l.trim()) ?? "");
  const title = [...(firstLine || "New video")].slice(0, 100).join("").trim();
  const description = [...clean(text)].slice(0, 5000).join("");
  return { title, description };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export const youtubePublisher: Publisher = {
  platform: "youtube",
  async publish(_target, accessToken, content) {
    const videoUrl = content.mediaUrls.find(isVideoUrl);
    if (!videoUrl) throw new PublishError("YouTube needs a video");
    const video = await downloadMedia(videoUrl, { maxBytes: maxVideoBytes(), platformName: "YouTube" });
    const type = video.type.startsWith("video/") ? video.type : "application/octet-stream";
    const { title, description } = youtubeTitleAndDescription(content.text);

    // Resumable upload: first send the details, then the file to the session URL YouTube returns.
    const { headers } = await requestJson(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
      platformName: "YouTube",
      method: "POST",
      headers: {
        ...auth(accessToken),
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(video.size),
        "X-Upload-Content-Type": type,
      },
      body: JSON.stringify({
        snippet: { title, description, categoryId: process.env.YOUTUBE_CATEGORY_ID ?? "22" },
        status: { privacyStatus: privacy(), selfDeclaredMadeForKids: false },
      }),
    });
    const session = headers.get("location");
    if (!session) throw new PublishError("YouTube didn't start the upload", { retryable: true });
    const { data } = await requestJson<{ id?: string; status?: { uploadStatus?: string; rejectionReason?: string } }>(session, {
      platformName: "YouTube",
      method: "PUT",
      headers: { "Content-Type": type, "Content-Length": String(video.size) },
      body: video.bytes as BodyInit,
      signal: AbortSignal.timeout(240_000),
    });
    if (!data.id) throw new PublishError("YouTube did not return a video id");
    if (data.status?.uploadStatus === "rejected") throw new PublishError(`YouTube rejected the video (${data.status.rejectionReason ?? "unknown reason"})`);
    return { externalPostId: data.id, url: `https://www.youtube.com/watch?v=${data.id}` };
  },
  async metrics(_target, accessToken, id) {
    const { data } = await requestJson<{ items?: { statistics?: { viewCount?: string; likeCount?: string; commentCount?: string } }[] }>(
      `${API}/videos?part=statistics&id=${encodeURIComponent(id)}`,
      { platformName: "YouTube", headers: auth(accessToken) },
    );
    const s = data.items?.[0]?.statistics;
    if (!s) return {};
    return cleanMetrics({ views: s.viewCount, likes: s.likeCount, comments: s.commentCount });
  },
  async refresh({ refreshToken }) {
    if (!refreshToken) throw new PublishError("YouTube needs to be reconnected", { auth: true });
    const { data } = await requestJson<{ access_token: string; expires_in: number; refresh_token?: string }>("https://oauth2.googleapis.com/token", {
      platformName: "YouTube",
      method: "POST",
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.YOUTUBE_CLIENT_ID ?? "",
        client_secret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      }),
    }).catch((err) => {
      // A revoked or expired grant can't be fixed by retrying: the creator has to reconnect.
      if (err instanceof PublishError && /invalid_grant|revoked|expired/i.test(err.message)) throw new PublishError(err.message, { auth: true });
      throw err;
    });
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken, expiresAt: new Date(Date.now() + data.expires_in * 1000) };
  },
};
