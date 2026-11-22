import { lookup } from "node:dns/promises";
import { isPrivateAddress } from "@/lib/webhooks/core";
import { fetchRaw, PublishError } from "./types";

export type DownloadedMedia = { bytes: Uint8Array; type: string; size: number };

/** Test hook: skip DNS checks (tests use fake hosts). */
let checkHosts = true;
export function setMediaHostChecks(on: boolean) {
  checkHosts = on;
}

async function assertPublic(url: URL, platformName: string) {
  if (url.protocol !== "https:") throw new PublishError(`${platformName}: media must be a public https:// link`);
  if (!checkHosts) return;
  const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
  if (!addresses.length || addresses.some((a) => isPrivateAddress(a.address))) {
    throw new PublishError(`${platformName}: the media link doesn't point at a public website`);
  }
}

/**
 * Downloads a user-supplied media URL to upload it to a platform.
 * Only public https hosts (checked again on each redirect), with a size cap so a huge file can't exhaust memory.
 */
export async function downloadMedia(rawUrl: string, opts: { maxBytes: number; platformName: string }): Promise<DownloadedMedia> {
  const { platformName, maxBytes } = opts;
  let url = new URL(rawUrl);
  let res: Response | null = null;
  for (let hop = 0; hop < 4; hop++) {
    await assertPublic(url, platformName);
    res = await fetchRaw(url, { redirect: "manual", signal: AbortSignal.timeout(120_000) }).catch(() => null);
    if (!res) throw new PublishError(`${platformName}: couldn't download the media`, { retryable: true });
    const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!next) break;
    url = new URL(next, url);
    res = null;
  }
  if (!res) throw new PublishError(`${platformName}: the media link redirects too many times`);
  if (!res.ok) throw new PublishError(`${platformName}: couldn't download the media (HTTP ${res.status})`, { retryable: res.status >= 500 });
  const declared = Number(res.headers.get("content-length") ?? 0);
  const mb = Math.round(maxBytes / 1024 / 1024);
  if (declared > maxBytes) throw new PublishError(`${platformName}: the file is over ${mb} MB`);

  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = res.body?.getReader();
  if (!reader) throw new PublishError(`${platformName}: the media download was empty`);
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new PublishError(`${platformName}: the file is over ${mb} MB`);
    }
    chunks.push(value);
  }
  if (size === 0) throw new PublishError(`${platformName}: the media download was empty`);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  const type = (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0].trim();
  return { bytes, type, size };
}
