import type { AutopilotSlot } from "@/db/schema";

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function tzOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Converts a wall-clock time in `timeZone` to a UTC instant (DST-safe). */
export function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let utc = guess - tzOffsetMs(new Date(guess), timeZone);
  // Second pass settles times near a DST transition.
  utc = guess - tzOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

/** Calendar date + weekday of `instant` as seen in `timeZone`. */
function zonedDate(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")), weekday };
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseSlotTime(time: string): { hour: number; minute: number } | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  return m ? { hour: Number(m[1]), minute: Number(m[2]) } : null;
}

/**
 * Every slot occurrence (as UTC instants) strictly after `from` and within `days` days,
 * in chronological order.
 */
export function upcomingSlots(slots: AutopilotSlot[], timeZone: string, from: Date, days: number): Date[] {
  const out: Date[] = [];
  const end = from.getTime() + days * 86_400_000;
  for (let i = 0; i <= days; i++) {
    const probe = new Date(from.getTime() + i * 86_400_000);
    const { year, month, day, weekday } = zonedDate(probe, timeZone);
    for (const slot of slots) {
      if (slot.day !== weekday) continue;
      const t = parseSlotTime(slot.time);
      if (!t) continue;
      const at = zonedToUtc(year, month, day, t.hour, t.minute, timeZone);
      if (at.getTime() > from.getTime() && at.getTime() <= end) out.push(at);
    }
  }
  return [...new Map(out.map((d) => [d.getTime(), d])).values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Slots that don't already have a post within `toleranceMinutes` of them. */
export function freeSlots(candidates: Date[], taken: Date[], toleranceMinutes = 30): Date[] {
  const tol = toleranceMinutes * 60_000;
  return candidates.filter((c) => !taken.some((t) => Math.abs(t.getTime() - c.getTime()) < tol));
}

/** The next free slot, or null when none is configured within `days`. */
export function nextFreeSlot(slots: AutopilotSlot[], timeZone: string, from: Date, taken: Date[], days = 14): Date | null {
  return freeSlots(upcomingSlots(slots, timeZone, from, days), taken)[0] ?? null;
}
