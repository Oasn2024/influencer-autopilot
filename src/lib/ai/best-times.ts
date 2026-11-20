import type { AutopilotSlot } from "@/db/schema";
import type { PlatformId } from "@/lib/platforms";

/**
 * Starting-point posting times per platform (local time), drawn from widely published
 * industry studies. Every audience differs, so these are suggestions to test, not rules.
 * Days: 0 = Sunday … 6 = Saturday.
 */
export const BEST_TIMES: Partial<Record<PlatformId, { days: number[]; times: string[]; why: string }>> = {
  linkedin: { days: [2, 3, 4], times: ["08:30", "12:00"], why: "Weekday mornings and lunch, when people check work feeds" },
  x: { days: [1, 2, 3, 4, 5], times: ["09:00", "12:30"], why: "Weekday mornings and lunch breaks" },
  facebook: { days: [1, 2, 3, 4, 5], times: ["09:00", "13:00"], why: "Weekday mornings and early afternoon" },
  instagram: { days: [1, 2, 3, 4, 5], times: ["11:00", "18:00"], why: "Late morning and after work" },
  threads: { days: [1, 2, 3, 4], times: ["08:00", "19:00"], why: "Morning commute and evening scroll" },
  tiktok: { days: [2, 4, 5], times: ["17:00", "20:00"], why: "Evenings, when people relax with video" },
  pinterest: { days: [0, 5, 6], times: ["20:00"], why: "Evenings and weekends, when people plan" },
  youtube: { days: [4, 5, 6], times: ["15:00"], why: "Afternoons before the evening watch peak" },
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** One-line summary for a platform, e.g. "Tue–Thu at 08:30 or 12:00". */
export function bestTimeLabel(platform: PlatformId): string | null {
  const b = BEST_TIMES[platform];
  if (!b) return null;
  const days = b.days.length > 2 && b.days.every((d, i) => i === 0 || d === b.days[i - 1] + 1)
    ? `${DAY_NAMES[b.days[0]]}–${DAY_NAMES[b.days[b.days.length - 1]]}`
    : b.days.map((d) => DAY_NAMES[d]).join(", ");
  return `${days} at ${b.times.join(" or ")}`;
}

/**
 * Weekly slots for a set of platforms: one post per suggested day, at the time
 * most platforms agree on, capped so autopilot doesn't flood anyone's feed.
 */
export function suggestedSlots(platforms: PlatformId[], maxPerWeek = 5): AutopilotSlot[] {
  const dayVotes = new Map<number, number>();
  const timeVotes = new Map<string, number>();
  for (const p of new Set(platforms)) {
    const b = BEST_TIMES[p];
    if (!b) continue;
    for (const d of b.days) dayVotes.set(d, (dayVotes.get(d) ?? 0) + 1);
    b.times.forEach((t, i) => timeVotes.set(t, (timeVotes.get(t) ?? 0) + (i === 0 ? 2 : 1)));
  }
  if (dayVotes.size === 0) return [1, 3, 5].map((day) => ({ day, time: "09:00" }));
  const time = [...timeVotes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
  return [...dayVotes]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, maxPerWeek)
    .map(([day]) => ({ day, time }))
    .sort((a, b) => a.day - b.day);
}
