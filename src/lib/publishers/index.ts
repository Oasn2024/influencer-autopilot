import type { PlatformId } from "@/lib/platforms";
import { linkedinPublisher } from "./linkedin";
import { facebookPublisher, instagramPublisher, threadsPublisher } from "./meta";
import type { Publisher } from "./types";
import { tiktokPublisher } from "./tiktok";
import { xPublisher } from "./x";
import { youtubePublisher } from "./youtube";

const publishers: Partial<Record<PlatformId, Publisher>> = {
  x: xPublisher,
  linkedin: linkedinPublisher,
  threads: threadsPublisher,
  facebook: facebookPublisher,
  instagram: instagramPublisher,
  youtube: youtubePublisher,
  tiktok: tiktokPublisher,
};

export function getPublisher(platform: PlatformId): Publisher | undefined {
  return publishers[platform];
}

export { PublishError } from "./types";
