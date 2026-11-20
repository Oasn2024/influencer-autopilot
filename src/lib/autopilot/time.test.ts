import { describe, expect, it } from "vitest";
import { freeSlots, isValidTimeZone, nextFreeSlot, parseSlotTime, upcomingSlots, zonedToUtc } from "./time";

describe("zonedToUtc", () => {
  it("converts wall-clock time in a zone to UTC", () => {
    expect(zonedToUtc(2026, 7, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-07-01T13:00:00.000Z"); // EDT
    expect(zonedToUtc(2026, 12, 1, 9, 0, "America/New_York").toISOString()).toBe("2026-12-01T14:00:00.000Z"); // EST
    expect(zonedToUtc(2026, 12, 1, 9, 30, "Asia/Kolkata").toISOString()).toBe("2026-12-01T04:00:00.000Z");
    expect(zonedToUtc(2026, 12, 1, 9, 0, "UTC").toISOString()).toBe("2026-12-01T09:00:00.000Z");
  });
});

describe("slot parsing", () => {
  it("accepts HH:MM only", () => {
    expect(parseSlotTime("09:05")).toEqual({ hour: 9, minute: 5 });
    expect(parseSlotTime("24:00")).toBeNull();
    expect(parseSlotTime("9:00")).toBeNull();
  });
  it("validates time zones", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
});

describe("upcomingSlots", () => {
  // Friday 2026-11-20 12:00 UTC
  const from = new Date("2026-11-20T12:00:00Z");

  it("lists each weekly slot in the horizon in order", () => {
    const slots = [
      { day: 1, time: "09:00" }, // Monday
      { day: 5, time: "18:00" }, // Friday
    ];
    const got = upcomingSlots(slots, "UTC", from, 8).map((d) => d.toISOString());
    expect(got).toEqual(["2026-11-20T18:00:00.000Z", "2026-11-23T09:00:00.000Z", "2026-11-27T18:00:00.000Z"]);
  });

  it("uses the user's zone for the weekday and time", () => {
    // Friday 09:00 in Los Angeles is 17:00 UTC, still ahead of `from`.
    const got = upcomingSlots([{ day: 5, time: "09:00" }], "America/Los_Angeles", from, 2);
    expect(got.map((d) => d.toISOString())).toEqual(["2026-11-20T17:00:00.000Z"]);
  });

  it("skips slots already in the past", () => {
    expect(upcomingSlots([{ day: 5, time: "08:00" }], "UTC", from, 1)).toEqual([]);
  });
});

describe("freeSlots", () => {
  it("drops slots that already have a post nearby", () => {
    const a = new Date("2026-11-21T09:00:00Z");
    const b = new Date("2026-11-22T09:00:00Z");
    expect(freeSlots([a, b], [new Date("2026-11-21T09:10:00Z")])).toEqual([b]);
    expect(freeSlots([a, b], [new Date("2026-11-21T10:00:00Z")])).toEqual([a, b]);
  });
  it("nextFreeSlot returns null with no slots", () => {
    expect(nextFreeSlot([], "UTC", new Date(), [])).toBeNull();
  });
});
