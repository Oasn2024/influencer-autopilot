import { isVideoUrl } from "./validation";
import { cleanMetrics, PublishError, requestJson, sleep, type Publisher } from "./types";

export const graphVersion = () => process.env.META_GRAPH_VERSION ?? "v23.0";
const fb = (path: string) => `https://graph.facebook.com/${graphVersion()}${path}`;
const threads = (path: string) => `https://graph.threads.net/v1.0${path}`;

const form = (params: Record<string, string | undefined>) => {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined) body.set(k, v);
  return body;
};

/** Containers for video are processed asynchronously; wait until ready (max ~2 minutes). */
async function waitForContainer(statusUrl: string, field: "status_code" | "status", platformName: string) {
  for (let i = 0; i < 24; i++) {
    const { data } = await requestJson<Record<string, string>>(statusUrl, { platformName });
    const status = data[field];
    if (status === "FINISHED") return;
    if (status === "ERROR" || status === "EXPIRED") {
      throw new PublishError(`${platformName} could not process the media (${data.error_message ?? status})`);
    }
    await sleep(5000);
  }
  throw new PublishError(`${platformName} is still processing the media`, { retryable: true });
}

/** Reads Graph-style insights: [{ name, values: [{ value }] }] or [{ name, total_value: { value } }]. */
export function readInsights(data: { data?: { name: string; values?: { value: number }[]; total_value?: { value: number } }[] }) {
  const out: Record<string, number> = {};
  for (const m of data.data ?? []) {
    const v = m.total_value?.value ?? m.values?.[0]?.value;
    if (typeof v === "number") out[m.name] = v;
  }
  return out;
}

export const facebookPublisher: Publisher = {
  platform: "facebook",
  async metrics(_target, pageToken, id) {
    type R = { reactions?: { summary?: { total_count?: number } }; comments?: { summary?: { total_count?: number } }; shares?: { count?: number } };
    const fields = "reactions.summary(total_count).limit(0),comments.summary(total_count).limit(0),shares";
    const { data } = await requestJson<R>(fb(`/${id}?fields=${encodeURIComponent(fields)}&access_token=${pageToken}`), { platformName: "Facebook" });
    return cleanMetrics({
      likes: data.reactions?.summary?.total_count,
      comments: data.comments?.summary?.total_count,
      shares: data.shares?.count ?? 0,
    });
  },
  async publish(target, pageToken, content) {
    const pageId = target.externalAccountId;
    const [first] = content.mediaUrls;
    let res;
    if (first && isVideoUrl(first)) {
      res = await requestJson<{ id: string }>(fb(`/${pageId}/videos`), {
        platformName: "Facebook",
        method: "POST",
        body: form({ file_url: first, description: content.text, access_token: pageToken }),
      });
    } else if (first) {
      res = await requestJson<{ id: string; post_id?: string }>(fb(`/${pageId}/photos`), {
        platformName: "Facebook",
        method: "POST",
        body: form({ url: first, caption: content.text, access_token: pageToken }),
      });
    } else {
      const link = /https?:\/\/\S+/.exec(content.text)?.[0];
      res = await requestJson<{ id: string }>(fb(`/${pageId}/feed`), {
        platformName: "Facebook",
        method: "POST",
        body: form({ message: content.text, link, access_token: pageToken }),
      });
    }
    const data = res.data as { id: string; post_id?: string };
    const id = data.post_id ?? data.id;
    if (!id) throw new PublishError("Facebook did not return a post id");
    return { externalPostId: id, url: `https://www.facebook.com/${id}` };
  },
};

export const instagramPublisher: Publisher = {
  platform: "instagram",
  async metrics(_target, pageToken, id) {
    const { data } = await requestJson<{ like_count?: number; comments_count?: number }>(
      fb(`/${id}?fields=like_count,comments_count&access_token=${pageToken}`),
      { platformName: "Instagram" },
    );
    // Views and shares need the insights permission; older connections may not have it.
    const insights = await requestJson<Parameters<typeof readInsights>[0]>(fb(`/${id}/insights?metric=views,shares&access_token=${pageToken}`), {
      platformName: "Instagram",
    })
      .then((r) => readInsights(r.data))
      .catch(() => ({}) as Record<string, number>);
    return cleanMetrics({ likes: data.like_count, comments: data.comments_count, shares: insights.shares, views: insights.views });
  },
  async publish(target, pageToken, content) {
    const igId = target.externalAccountId;
    const createItem = async (url: string, extra: Record<string, string | undefined>) => {
      const video = isVideoUrl(url);
      const { data } = await requestJson<{ id: string }>(fb(`/${igId}/media`), {
        platformName: "Instagram",
        method: "POST",
        body: form({
          ...(video ? { video_url: url, media_type: extra.is_carousel_item ? "VIDEO" : "REELS" } : { image_url: url }),
          ...extra,
          access_token: pageToken,
        }),
      });
      if (video) await waitForContainer(fb(`/${data.id}?fields=status_code&access_token=${pageToken}`), "status_code", "Instagram");
      return data.id;
    };

    let creationId: string;
    if (content.mediaUrls.length === 0) throw new PublishError("Instagram needs an image or video");
    if (content.mediaUrls.length === 1) {
      creationId = await createItem(content.mediaUrls[0], { caption: content.text });
    } else {
      const children: string[] = [];
      for (const url of content.mediaUrls) children.push(await createItem(url, { is_carousel_item: "true" }));
      const { data } = await requestJson<{ id: string }>(fb(`/${igId}/media`), {
        platformName: "Instagram",
        method: "POST",
        body: form({ media_type: "CAROUSEL", children: children.join(","), caption: content.text, access_token: pageToken }),
      });
      creationId = data.id;
    }
    const { data } = await requestJson<{ id: string }>(fb(`/${igId}/media_publish`), {
      platformName: "Instagram",
      method: "POST",
      body: form({ creation_id: creationId, access_token: pageToken }),
    });
    const link = await requestJson<{ permalink?: string }>(fb(`/${data.id}?fields=permalink&access_token=${pageToken}`), {
      platformName: "Instagram",
    }).catch(() => ({ data: {} as { permalink?: string } }));
    return { externalPostId: data.id, url: link.data.permalink };
  },
};

export const threadsPublisher: Publisher = {
  platform: "threads",
  async metrics(_target, accessToken, id) {
    const { data } = await requestJson<Parameters<typeof readInsights>[0]>(
      threads(`/${id}/insights?metric=views,likes,replies,reposts,quotes&access_token=${accessToken}`),
      { platformName: "Threads" },
    );
    const m = readInsights(data);
    return cleanMetrics({
      likes: m.likes,
      comments: m.replies,
      shares: m.reposts === undefined && m.quotes === undefined ? undefined : (m.reposts ?? 0) + (m.quotes ?? 0),
      views: m.views,
    });
  },
  async publish(target, accessToken, content) {
    const userId = target.externalAccountId;
    const [first] = content.mediaUrls;
    const media = first
      ? isVideoUrl(first)
        ? { media_type: "VIDEO", video_url: first }
        : { media_type: "IMAGE", image_url: first }
      : { media_type: "TEXT" };
    const { data: container } = await requestJson<{ id: string }>(threads(`/${userId}/threads`), {
      platformName: "Threads",
      method: "POST",
      body: form({ ...media, text: content.text, access_token: accessToken }),
    });
    if (media.media_type !== "TEXT") {
      await waitForContainer(threads(`/${container.id}?fields=status,error_message&access_token=${accessToken}`), "status", "Threads");
    }
    const { data } = await requestJson<{ id: string }>(threads(`/${userId}/threads_publish`), {
      platformName: "Threads",
      method: "POST",
      body: form({ creation_id: container.id, access_token: accessToken }),
    });
    const link = await requestJson<{ permalink?: string }>(threads(`/${data.id}?fields=permalink&access_token=${accessToken}`), {
      platformName: "Threads",
    }).catch(() => ({ data: {} as { permalink?: string } }));
    return { externalPostId: data.id, url: link.data.permalink };
  },
  async refresh({ accessToken }) {
    // Long-lived Threads tokens refresh themselves (valid 60 days, refreshable after 24h).
    const { data } = await requestJson<{ access_token: string; expires_in: number }>(
      `https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${encodeURIComponent(accessToken)}`,
      { platformName: "Threads" },
    );
    return { accessToken: data.access_token, expiresAt: new Date(Date.now() + data.expires_in * 1000) };
  },
};
