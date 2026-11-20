import { describe, expect, it } from "vitest";
import { setupSteps } from "./onboarding";

describe("setupSteps", () => {
  it("marks each step from the creator's state", () => {
    const steps = setupSteps({ accounts: 1, brandVoice: "short", posts: 0, slots: 3, autopilotOn: false });
    expect(steps.map((s) => [s.id, s.done])).toEqual([
      ["connect", true],
      ["voice", false],
      ["post", false],
      ["times", true],
      ["autopilot", false],
    ]);
  });
});
