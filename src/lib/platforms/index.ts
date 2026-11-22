/**
 * Catalogue of the social platforms the autopilot can publish to.
 * Each integration (OAuth flow + publish client) will plug in behind its id.
 */
export const PLATFORM_IDS = [
  "facebook",
  "instagram",
  "whatsapp",
  "x",
  "pinterest",
  "threads",
  "youtube",
  "tiktok",
  "linkedin",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export type ContentKind = "text" | "image" | "video" | "link";

export type PlatformInfo = {
  id: PlatformId;
  name: string;
  /** What the platform's publishing API accepts. */
  supports: ContentKind[];
  /** Max characters for a post caption/body, where the platform enforces one. */
  maxTextLength?: number;
  /** Developer portal where the app credentials for this platform are created. */
  developerPortal: string;
  /** True once an integration (connect + publish) is implemented in this codebase. */
  available: boolean;
  /** Brand color for chips and calendar dots (CSS color; X and Threads follow the text color). */
  color: string;
};

export const PLATFORMS: Record<PlatformId, PlatformInfo> = {
  facebook: { id: "facebook", name: "Facebook", supports: ["text", "image", "video", "link"], maxTextLength: 63206, developerPortal: "https://developers.facebook.com/apps", available: true, color: "#1877F2" },
  instagram: { id: "instagram", name: "Instagram", supports: ["image", "video"], maxTextLength: 2200, developerPortal: "https://developers.facebook.com/apps", available: true, color: "#E4405F" },
  whatsapp: { id: "whatsapp", name: "WhatsApp", supports: ["text", "image", "video", "link"], maxTextLength: 4096, developerPortal: "https://developers.facebook.com/apps", available: false, color: "#25D366" },
  x: { id: "x", name: "X", supports: ["text", "image", "video", "link"], maxTextLength: 280, developerPortal: "https://developer.x.com/en/portal/dashboard", available: true, color: "var(--foreground)" },
  pinterest: { id: "pinterest", name: "Pinterest", supports: ["image", "video", "link"], maxTextLength: 500, developerPortal: "https://developers.pinterest.com/apps/", available: false, color: "#E60023" },
  threads: { id: "threads", name: "Threads", supports: ["text", "image", "video", "link"], maxTextLength: 500, developerPortal: "https://developers.facebook.com/apps", available: true, color: "var(--foreground)" },
  youtube: { id: "youtube", name: "YouTube", supports: ["video"], maxTextLength: 5000, developerPortal: "https://console.cloud.google.com/apis/credentials", available: true, color: "#FF0000" },
  tiktok: { id: "tiktok", name: "TikTok", supports: ["video"], maxTextLength: 2200, developerPortal: "https://developers.tiktok.com/apps", available: true, color: "#FE2C55" },
  linkedin: { id: "linkedin", name: "LinkedIn", supports: ["text", "image", "video", "link"], maxTextLength: 3000, developerPortal: "https://www.linkedin.com/developers/apps", available: true, color: "#0A66C2" },
};

export function isPlatformId(value: string): value is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(value);
}
