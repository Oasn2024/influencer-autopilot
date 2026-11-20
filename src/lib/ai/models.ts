/** AI choices shown to creators. All run through the Vercel AI Gateway, so one setup covers every vendor. */

export const TEXT_MODELS = [
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", note: "Best all-round writer" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", note: "Fastest, great for quick ideas" },
  { id: "openai/gpt-5.5", label: "GPT-5.5", note: "OpenAI's flagship" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", note: "Google, quick and low cost" },
] as const;

export const IMAGE_MODELS = [
  { id: "openai/gpt-image-2", label: "GPT Image 2", note: "Great with text in images" },
  { id: "bfl/flux-3-image", label: "FLUX 3", note: "Photo-real and artistic styles" },
] as const;

export const TONES = ["friendly", "professional", "playful", "inspiring", "bold", "educational"] as const;
export const GOALS = [
  { id: "engage", label: "Start a conversation" },
  { id: "promote", label: "Promote something" },
  { id: "educate", label: "Teach a tip" },
  { id: "announce", label: "Share news" },
  { id: "story", label: "Tell a story" },
] as const;

export const ASPECTS = [
  { id: "1:1", label: "Square (feed)" },
  { id: "4:5", label: "Portrait (Instagram)" },
  { id: "9:16", label: "Vertical (Stories, Reels)" },
  { id: "16:9", label: "Wide (X, LinkedIn, YouTube)" },
] as const;

export type Tone = (typeof TONES)[number];
export type Goal = (typeof GOALS)[number]["id"];
export type Aspect = (typeof ASPECTS)[number]["id"];

export const GOAL_IDS = GOALS.map((g) => g.id) as [Goal, ...Goal[]];
export const ASPECT_IDS = ASPECTS.map((a) => a.id) as [Aspect, ...Aspect[]];

export const DEFAULT_TEXT_MODEL = TEXT_MODELS[0].id;
export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS[0].id;

/** Only allow models from the lists above (or the AI_MODEL override), so callers can't pick arbitrary paid models. */
export function resolveTextModel(requested?: string | null, envDefault?: string): string {
  if (requested && TEXT_MODELS.some((m) => m.id === requested)) return requested;
  return envDefault || DEFAULT_TEXT_MODEL;
}

export function resolveImageModel(requested?: string | null): string {
  return requested && IMAGE_MODELS.some((m) => m.id === requested) ? requested : DEFAULT_IMAGE_MODEL;
}
