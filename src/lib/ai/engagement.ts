import type { PlatformId } from "@/lib/platforms";

/**
 * A quick, explainable "will this land?" check. It's a heuristic, not a prediction:
 * each check is a habit that well-performing posts tend to share, with a tip to fix it.
 */
export type EngagementCheck = { id: string; label: string; ok: boolean; tip: string; weight: number };
export type EngagementScore = { score: number; grade: "Great" | "Good" | "Needs work"; checks: EngagementCheck[] };

/** Sweet spots per platform: [min chars, max chars], [min hashtags, max hashtags]. */
const SWEET: Partial<Record<PlatformId, { length: [number, number]; tags: [number, number] }>> = {
  x: { length: [70, 260], tags: [0, 2] },
  threads: { length: [80, 450], tags: [0, 1] },
  linkedin: { length: [300, 1800], tags: [1, 3] },
  facebook: { length: [40, 500], tags: [0, 3] },
  instagram: { length: [120, 1500], tags: [3, 10] },
  tiktok: { length: [40, 300], tags: [2, 5] },
  pinterest: { length: [80, 500], tags: [0, 5] },
  youtube: { length: [100, 2000], tags: [1, 5] },
  whatsapp: { length: [20, 700], tags: [0, 0] },
};
const DEFAULT_SWEET = { length: [60, 800] as [number, number], tags: [0, 5] as [number, number] };

const CTA = /\b(comment|reply|share|save|tag|follow|join|sign up|register|book|shop|buy|order|download|learn more|read more|link in bio|dm me|message us|try|visit|grab|check (it )?out|let me know|tell me|drop a)\b/i;

export function scorePost(input: { text: string; platform?: PlatformId; hasMedia?: boolean }): EngagementScore {
  const text = input.text.trim();
  const chars = [...text].length;
  const firstLine = text.split("\n")[0]?.trim() ?? "";
  const hashtags = text.match(/(^|\s)#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  const sweet = (input.platform && SWEET[input.platform]) || DEFAULT_SWEET;
  const p = input.platform;

  const checks: EngagementCheck[] = [
    {
      id: "hook",
      label: "Strong opening line",
      ok: firstLine.length > 0 && [...firstLine].length <= 120 && (/[?!:]|\d/.test(firstLine) || /^(how|why|what|stop|the|i|we|you|this|here)/i.test(firstLine)),
      tip: "Open with a short line that makes people stop: a question, a number, or a bold claim.",
      weight: 25,
    },
    {
      id: "cta",
      label: "Invites a response",
      ok: text.includes("?") || CTA.test(text),
      tip: "End with a question or one clear call to action so people know what to do next.",
      weight: 20,
    },
    {
      id: "length",
      label: "Good length for the platform",
      ok: chars >= sweet.length[0] && chars <= sweet.length[1],
      tip: `Aim for ${sweet.length[0]}–${sweet.length[1]} characters here (now ${chars}).`,
      weight: 15,
    },
    {
      id: "hashtags",
      label: "Right number of hashtags",
      ok: hashtags >= sweet.tags[0] && hashtags <= sweet.tags[1],
      tip: sweet.tags[1] === 0 ? "Skip hashtags on this platform." : `Use ${sweet.tags[0]}–${sweet.tags[1]} relevant hashtags here (now ${hashtags}).`,
      weight: 10,
    },
    {
      id: "media",
      label: "Has an image or video",
      ok: Boolean(input.hasMedia),
      tip: "Posts with a picture or short video usually get noticed more. Try the AI image generator.",
      weight: 15,
    },
    {
      id: "readable",
      label: "Easy to skim",
      ok: chars < 280 || text.includes("\n"),
      tip: "Break longer posts into short paragraphs or a list.",
      weight: 10,
    },
  ];
  if (p === "instagram" || p === "tiktok") {
    checks.push({
      id: "links",
      label: "No dead links in the caption",
      ok: !/https?:\/\//i.test(text),
      tip: "Links in captions aren't clickable here. Say \"link in bio\" instead.",
      weight: 5,
    });
  }

  const total = checks.reduce((n, c) => n + c.weight, 0);
  const earned = checks.reduce((n, c) => n + (c.ok ? c.weight : 0), 0);
  const score = text ? Math.round((earned / total) * 100) : 0;
  return { score, grade: score >= 80 ? "Great" : score >= 55 ? "Good" : "Needs work", checks };
}
