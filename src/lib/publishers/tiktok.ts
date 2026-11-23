import { downloadMedia } from "./media";
import { maxVideoBytes } from "./youtube";
import { isVideoUrl } from "./validation";
import { cleanMetrics, fetchRaw, PublishError, requestJson, sleep, type Publisher } from "./types";

const API = "https://open.tiktokapis.com/v2";
const MB = 1024 * 1024;

const json = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8" });

type TikTokEnvelope<T> = { data?: T; error?: { code?: string; message?: string } };

/** TikTok answers 200 with an error code for some failures; treat anything but "ok" as an error. */
async function call<T>(path: string, token: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetchRaw(`${API}${path}`, { method: "POST", headers: json(token), body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch (err) {
    throw new PublishError(`TikTok could not be reached (${err instanceof Error ? err.message : "network error"})`, { retryable: true });
  }
  const data = (await res.json().catch(() => ({}))) as TikTokEnvelope<T>;
  const code = data.error?.code ?? (res.ok ? "ok" : `http_${res.status}`);
  if (!res.ok || code !== "ok") {
    const auth = res.status === 401 || /access_token|scope_not_authorized|token/i.test(code);
    const retryable = res.status === 429 || res.status >= 500 || /rate_limit|spam_risk_too_many|internal/i.test(code);
    throw new TikTokError(code, `TikTok error: ${data.error?.message || code}`, { auth, retryable });
  }
  return data.data as T;
}

export class TikTokError extends PublishError {
  constructor(readonly code: string, message: string, opts: { auth?: boolean; retryable?: boolean }) {
    super(message, opts);
  }
}

/**
 * TikTok wants the file in chunks of 5-64 MB; files under 5 MB go in one piece,
 * and the last chunk takes whatever is left over (so it can be up to 2x the chunk size).
 */
export function tiktokChunks(size: number, chunkSize = 10 * MB) {
  if (size <= 5 * MB) return { chunkSize: size, count: 1 };
  const count = Math.max(1, Math.floor(size / chunkSize));
  return { chunkSize, count };
}

const PRIVACY_PREFERENCE = ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "FOLLOWER_OF_CREATOR", "SELF_ONLY"];

/** The creator's chosen privacy if TikTok allows it, otherwise the most public option they have. */
export function pickPrivacy(options: string[], wanted = process.env.TIKTOK_PRIVACY ?? "PUBLIC_TO_EVERYONE") {
  if (options.includes(wanted)) return wanted;
  return PRIVACY_PREFERENCE.find((p) => options.includes(p)) ?? options[0] ?? "SELF_ONLY";
}

type Status = { status?: string; fail_reason?: string; publicaly_available_post_id?: (string | number)[] };

export const tiktokPublisher: Publisher = {
  platform: "tiktok",
  async publish(target, accessToken, content) {
    const videoUrl = content.mediaUrls.find(isVideoUrl);
    if (!videoUrl) throw new PublishError("TikTok needs a video");
    const creator = await call<{ privacy_level_options?: string[]; creator_username?: string }>("/post/publish/creator_info/query/", accessToken, {});
    const video = await downloadMedia(videoUrl, { maxBytes: maxVideoBytes(), platformName: "TikTok" });
    const { chunkSize, count } = tiktokChunks(video.size);

    const init = (privacy_level: string) =>
      call<{ publish_id: string; upload_url: string }>("/post/publish/video/init/", accessToken, {
        post_info: { title: [...content.text.trim()].slice(0, 2200).join(""), privacy_level, disable_comment: false, disable_duet: false, disable_stitch: false },
        source_info: { source: "FILE_UPLOAD", video_size: video.size, chunk_size: chunkSize, total_chunk_count: count },
      });
    let privacy = pickPrivacy(creator.privacy_level_options ?? []);
    let started: { publish_id: string; upload_url: string };
    try {
      started = await init(privacy);
    } catch (err) {
      // Until TikTok audits the app, it may only post privately ("Only me").
      if (!(err instanceof TikTokError) || !/unaudited|private/i.test(err.code) || privacy === "SELF_ONLY") throw err;
      privacy = "SELF_ONLY";
      started = await init(privacy);
    }

    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? video.size : start + chunkSize;
      await requestJson(started.upload_url, {
        platformName: "TikTok",
        method: "PUT",
        headers: { "Content-Type": video.type.startsWith("video/") ? video.type : "video/mp4", "Content-Length": String(end - start), "Content-Range": `bytes ${start}-${end - 1}/${video.size}` },
        body: video.bytes.subarray(start, end) as BodyInit,
        signal: AbortSignal.timeout(180_000),
      });
    }

    // TikTok processes the video after upload; wait up to about a minute for the public post id.
    let status: Status = {};
    for (let i = 0; i < 12; i++) {
      status = await call<Status>("/post/publish/status/fetch/", accessToken, { publish_id: started.publish_id });
      if (status.status === "FAILED") throw new PublishError(`TikTok couldn't publish the video (${status.fail_reason ?? "unknown reason"})`);
      if (status.status === "PUBLISH_COMPLETE") break;
      await sleep(5000);
    }
    const postId = status.publicaly_available_post_id?.[0];
    const username = creator.creator_username ?? target.handle?.replace(/^@/, "");
    if (postId) return { externalPostId: String(postId), url: username ? `https://www.tiktok.com/@${username}/video/${postId}` : undefined };
    // Private ("Only me") posts, or ones still processing, have no public id yet.
    return { externalPostId: `publish:${started.publish_id}` };
  },
  async metrics(_target, accessToken, id) {
    if (id.startsWith("publish:")) return {};
    const data = await call<{ videos?: { like_count?: number; comment_count?: number; share_count?: number; view_count?: number }[] }>(
      "/video/query/?fields=id,like_count,comment_count,share_count,view_count",
      accessToken,
      { filters: { video_ids: [id] } },
    );
    const v = data?.videos?.[0];
    return v ? cleanMetrics({ likes: v.like_count, comments: v.comment_count, shares: v.share_count, views: v.view_count }) : {};
  },
  async refresh({ refreshToken }) {
    if (!refreshToken) throw new PublishError("TikTok needs to be reconnected", { auth: true });
    const { data } = await requestJson<{ access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }>(
      `${API}/oauth/token/`,
      {
        platformName: "TikTok",
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY ?? "",
          client_secret: process.env.TIKTOK_CLIENT_SECRET ?? "",
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      },
    );
    if (!data.access_token) throw new PublishError(`TikTok needs to be reconnected (${data.error_description ?? data.error ?? "refresh failed"})`, { auth: true });
    return { accessToken: data.access_token, refreshToken: data.refresh_token ?? refreshToken, expiresAt: new Date(Date.now() + (data.expires_in ?? 86400) * 1000) };
  },
};
