import { PLATFORMS, type PlatformId } from "@/lib/platforms";

export type PostContent = { text: string; mediaUrls: string[] };

export type ValidationIssue = { platform: PlatformId; message: string };

const VIDEO_EXT = /\.(mp4|mov|m4v|webm)(\?|$)/i;
export const isVideoUrl = (url: string) => VIDEO_EXT.test(url);

/** X counts every link as 23 characters, whatever its real length. */
function weightedLength(platform: PlatformId, text: string): number {
  if (platform !== "x") return [...text].length;
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(23))].length;
}

/** Problems that would make a platform reject this post. Empty means it can be published. */
export function validateForPlatform(platform: PlatformId, content: PostContent): ValidationIssue[] {
  const info = PLATFORMS[platform];
  const issues: ValidationIssue[] = [];
  const push = (message: string) => issues.push({ platform, message });
  const text = content.text.trim();
  const images = content.mediaUrls.filter((u) => !isVideoUrl(u));
  const videos = content.mediaUrls.filter(isVideoUrl);

  for (const url of content.mediaUrls) {
    if (!/^https:\/\//.test(url)) push(`Media must be a public https:// link (${url.slice(0, 40)})`);
  }
  if (!text && content.mediaUrls.length === 0) push("Add some text or media");
  if (info.maxTextLength && weightedLength(platform, text) > info.maxTextLength) {
    push(`${info.name} allows ${info.maxTextLength} characters; this is ${weightedLength(platform, text)}`);
  }
  if (!info.supports.includes("text") && content.mediaUrls.length === 0) push(`${info.name} needs an image or video`);
  if (videos.length && !info.supports.includes("video")) push(`${info.name} doesn't accept video here`);
  if (images.length && !info.supports.includes("image")) push(`${info.name} doesn't accept images here`);
  if (platform === "youtube" && videos.length !== 1) push("YouTube needs exactly one video");
  if (platform === "tiktok" && videos.length !== 1) push("TikTok needs exactly one video");
  if (platform === "instagram" && content.mediaUrls.length > 10) push("Instagram allows up to 10 media items");
  if (platform === "x" && content.mediaUrls.length > 4) push("X allows up to 4 media items");
  return issues;
}

/** Caption for one platform: the per-platform override if set, otherwise the shared body. */
export function captionFor(body: string, override?: string | null): string {
  return override?.trim() ? override : body;
}
