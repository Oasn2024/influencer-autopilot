import { describe, expect, it } from "vitest";
import { localDayKey, weekRange } from "./calendar";

describe("weekRange", () => {
  it("starts on Monday and spans 7 days in the user's time zone", () => {
    const r = weekRange("2026-11-20", "America/New_York"); // a Friday
    expect(r.days.map((d) => d.key)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(r.days[0].label).toBe("Mon");
    expect(r.start.toISOString()).toBe("2026-11-16T05:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-23T05:00:00.000Z");
    expect(r.prev).toBe("2026-11-09");
    expect(r.next).toBe("2026-11-23");
  });
  it("ignores a bad week param and uses today", () => {
    const now = new Date("2026-11-18T12:00:00Z");
    expect(weekRange("garbage", "UTC", now).days[0].key).toBe("2026-11-16");
  });
  it("puts late-evening posts on the local day", () => {
    expect(localDayKey(new Date("2026-11-21T02:00:00Z"), "America/Los_Angeles")).toBe("2026-11-20");
  });
});
