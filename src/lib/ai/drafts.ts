import "server-only";
import { generateText, Output } from "ai";
import { z } from "zod";
import { PLATFORMS, type PlatformId } from "@/lib/platforms";
import { resolveTextModel, type Goal, type Tone } from "./models";

/** The default model; on Vercel the AI Gateway authenticates with OIDC automatically. */
export const draftModel = (requested?: string | null) => resolveTextModel(requested, process.env.AI_MODEL);

export type DraftRequest = {
  /** What the post is about. */
  topic: string;
  brandVoice?: string;
  platforms: PlatformId[];
  /** Extra direction, e.g. "announce Saturday's pop-up, include the address". */
  notes?: string;
  /** Recent post bodies, so the AI doesn't repeat itself. */
  recentPosts?: string[];
  tone?: Tone;
  goal?: Goal;
  /** Long source material to repurpose (blog post, video transcript, newsletter). */
  sourceText?: string;
  /** Number of different options to write (1-3). */
  count?: number;
  model?: string | null;
};

export type Draft = {
  /** Scroll-stopping first line. */
  hook: string;
  body: string;
  variants: Partial<Record<PlatformId, string>>;
  hashtags: string[];
  /** Short idea for an image that would go with the post. */
  imageIdea: string;
  model: string;
};

const optionSchema = z.object({
  angle: z.string().describe("A 2-5 word label for this option's angle, e.g. 'Behind the scenes'"),
  hook: z.string().describe("The opening line, written to stop the scroll"),
  body: z.string().describe("Main post text that works on most platforms, starting with the hook"),
  variants: z
    .array(z.object({ platform: z.string(), text: z.string() }))
    .describe("A tailored version for each requested platform, within its character limit"),
  hashtags: z.array(z.string()).max(10),
  imageIdea: z.string().describe("One sentence describing an image that would suit this post"),
});

const schema = z.object({ options: z.array(optionSchema).min(1).max(3) });

const GOAL_TEXT: Record<Goal, string> = {
  engage: "start a conversation: end with a question people want to answer",
  promote: "promote something: make the benefit clear and end with one clear call to action",
  educate: "teach one useful, specific tip people can save and use",
  announce: "share news clearly: what, when, where, why it matters",
  story: "tell a short personal story with a lesson at the end",
};

export function buildDraftPrompt(req: DraftRequest): string {
  const count = Math.min(Math.max(req.count ?? 1, 1), 3);
  const limits = req.platforms
    .map((p) => `- ${p}: ${PLATFORMS[p].name}${PLATFORMS[p].maxTextLength ? `, max ${PLATFORMS[p].maxTextLength} characters` : ""}`)
    .join("\n");
  return [
    "You write social media posts for an independent creator or small business. Your posts get real engagement because they sound human, specific and useful.",
    req.brandVoice ? `Their voice and audience: ${req.brandVoice}` : "Write in a warm, plain, authentic voice.",
    req.tone ? `Tone: ${req.tone}.` : "",
    req.goal ? `Goal of the post: ${GOAL_TEXT[req.goal]}.` : "",
    req.sourceText
      ? `Repurpose this source material into social posts. Pull out the single most interesting idea for each option; don't summarise everything.\n<source>\n${req.sourceText.slice(0, 12000)}\n</source>`
      : `Topic: ${req.topic}`,
    req.sourceText && req.topic ? `Focus: ${req.topic}` : "",
    req.notes ? `Direction: ${req.notes}` : "",
    req.recentPosts?.length ? `Recent posts (don't repeat these):\n${req.recentPosts.map((p) => `- ${p.slice(0, 200)}`).join("\n")}` : "",
    `Write ${count} distinct option(s), each with a different angle. For each: a strong hook as the first line, a main post, a variant for each platform below kept safely under its limit and matched to the platform's style (X short and punchy, LinkedIn professional with line breaks, Instagram caption-style with hashtags at the end, Threads conversational, Facebook friendly), up to 10 relevant hashtags, and an image idea.\n${limits}`,
    "Don't invent facts, prices, dates, statistics or quotes that weren't given. No more than 3 hashtags inside any X, LinkedIn or Threads post.",
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

export function normalizeOption(o: z.infer<typeof optionSchema>, platforms: PlatformId[], model: string): Draft & { angle: string } {
  const variants: Partial<Record<PlatformId, string>> = {};
  for (const v of o.variants) {
    const p = v.platform.toLowerCase().trim() as PlatformId;
    if (platforms.includes(p) && v.text.trim()) variants[p] = fitToLimit(p, v.text.trim());
  }
  const hashtags = [...new Set(o.hashtags.map((h) => `#${h.replace(/^#+/, "").replace(/\s+/g, "")}`).filter((h) => h.length > 1))];
  return { angle: o.angle.trim(), hook: o.hook.trim(), body: o.body.trim(), variants, hashtags, imageIdea: o.imageIdea.trim(), model };
}

/** Several options for the composer. */
export async function generateDraftOptions(req: DraftRequest): Promise<(Draft & { angle: string })[]> {
  const model = draftModel(req.model);
  const { output } = await generateText({
    model,
    prompt: buildDraftPrompt(req),
    output: Output.object({ schema }),
    maxOutputTokens: 4000,
  });
  return output.options.slice(0, Math.min(Math.max(req.count ?? 1, 1), 3)).map((o) => normalizeOption(o, req.platforms, model));
}

/** One draft, used by autopilot. */
export async function generateDraft(req: DraftRequest): Promise<Draft> {
  const [first] = await generateDraftOptions({ ...req, count: 1 });
  return first;
}
