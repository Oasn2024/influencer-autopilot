import { zonedToUtc } from "@/lib/autopilot/time";

/** "YYYY-MM-DD" of an instant as seen in `timeZone`. */
export function localDayKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

const addDays = (key: string, n: number) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** The Monday-to-Sunday week containing `week` (a YYYY-MM-DD) or today, in the user's time zone. */
export function weekRange(week: string | undefined, timeZone: string, now = new Date()) {
  const base = week && /^\d{4}-\d{2}-\d{2}$/.test(week) && !Number.isNaN(Date.parse(week)) ? week : localDayKey(now, timeZone);
  const [y, m, d] = base.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
  const monday = addDays(base, -((weekday + 6) % 7));
  const keys = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  const at = (key: string) => {
    const [yy, mm, dd] = key.split("-").map(Number);
    return zonedToUtc(yy, mm, dd, 0, 0, timeZone);
  };
  return {
    days: keys.map((key) => ({
      key,
      label: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`)),
      date: Number(key.slice(8)),
    })),
    start: at(keys[0]),
    end: at(addDays(monday, 7)),
    prev: addDays(monday, -7),
    next: addDays(monday, 7),
    today: localDayKey(now, timeZone),
    title: `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${keys[0]}T12:00:00Z`))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${keys[6]}T12:00:00Z`))}`,
  };
}
