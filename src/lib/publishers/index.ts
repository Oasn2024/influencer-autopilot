import type { PlatformId } from "@/lib/platforms";
import { linkedinPublisher } from "./linkedin";
import { facebookPublisher, instagramPublisher, threadsPublisher } from "./meta";
import type { Publisher } from "./types";
import { xPublisher } from "./x";

const publishers: Partial<Record<PlatformId, Publisher>> = {
  x: xPublisher,
  linkedin: linkedinPublisher,
  threads: threadsPublisher,
  facebook: facebookPublisher,
  instagram: instagramPublisher,
};

export function getPublisher(platform: PlatformId): Publisher | undefined {
  return publishers[platform];
}

export { PublishError } from "./types";
