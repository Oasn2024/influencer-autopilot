import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";

/** Any AI Gateway model id; on Vercel the gateway authenticates with OIDC automatically. */
export const draftModel = () => process.env.AI_MODEL || "anthropic/claude-sonnet-5";

export type DraftRequest = {
  /** What the post is about. */
  topic: string;
  brandVoice?: string;
  platforms: PlatformId[];
  /** Extra direction, e.g. "announce Saturday's pop-up, include the address". */
  notes?: string;
  /** Recent post bodies, so the AI doesn't repeat itself. */
  recentPosts?: string[];
};

export type Draft = {
  body: string;
  variants: Partial<Record<PlatformId, string>>;
  hashtags: string[];
  model: string;
};

const schema = z.object({
  body: z.string().describe("Main post text that works on most platforms"),
  variants: z
    .array(z.object({ platform: z.string(), text: z.string() }))
    .describe("A tailored version for each requested platform, within its character limit"),
  hashtags: z.array(z.string()).max(8),
});

export function buildDraftPrompt(req: DraftRequest): string {
  const limits = req.platforms
    .map((p) => `- ${p}: ${PLATFORMS[p].name}${PLATFORMS[p].maxTextLength ? `, max ${PLATFORMS[p].maxTextLength} characters` : ""}`)
    .join("\n");
  return [
    "You write social media posts for an independent creator or small business.",
    req.brandVoice ? `Their voice and audience: ${req.brandVoice}` : "Write in a warm, plain, authentic voice.",
    `Topic: ${req.topic}`,
    req.notes ? `Direction: ${req.notes}` : "",
    req.recentPosts?.length ? `Recent posts (don't repeat these):\n${req.recentPosts.map((p) => `- ${p.slice(0, 200)}`).join("\n")}` : "",
    `Write one main post, then a variant for each platform below. Keep each variant safely under its limit, match the platform's norms (X short and punchy, LinkedIn professional, Instagram caption-style).\n${limits}`,
    "Don't invent facts, prices, dates or quotes that weren't given. No more than 3 hashtags inside any post.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Trims a variant to a platform's limit as a last resort, on a word boundary. */
export function fitToLimit(platform: PlatformId, text: string): string {
  const max = PLATFORMS[platform].maxTextLength;
  if (!max || [...text].length <= max) return text;
  const cut = [...text].slice(0, max - 1).join("");
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max - 40)).trimEnd()}…`;
}

export async function generateDraft(req: DraftRequest): Promise<Draft> {
  const model = draftModel();
  const { output } = await generateText({
    model,
    prompt: buildDraftPrompt(req),
    output: Output.object({ schema }),
    maxOutputTokens: 2000,
  });
  const variants: Partial<Record<PlatformId, string>> = {};
  for (const v of output.variants) {
    const p = v.platform.toLowerCase() as PlatformId;
    if (req.platforms.includes(p) && v.text.trim()) variants[p] = fitToLimit(p, v.text.trim());
  }
  return { body: output.body.trim(), variants, hashtags: output.hashtags, model };
}
