import { describe, expect, it } from "vitest";
import { metaNoPagesMessage } from "./providers";

describe("metaNoPagesMessage", () => {
  it("says to allow Pages when the person declined them", () => {
    expect(metaNoPagesMessage([{ permission: "pages_show_list", status: "declined" }])).toMatch(/didn't share your Pages/);
  });
  it("explains Page admin and Instagram linking otherwise", () => {
    expect(metaNoPagesMessage([{ permission: "pages_show_list", status: "granted" }])).toMatch(/admin of a Facebook Page/);
    expect(metaNoPagesMessage([])).toMatch(/professional account/);
  });
});
