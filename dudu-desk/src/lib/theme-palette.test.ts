import { describe, expect, it } from "vitest";
import { paletteKeys } from "./theme-palette";

describe("theme palette order", () => {
  it("leads with daylight and midnight while keeping all twelve themes", () => {
    expect(paletteKeys.slice(0, 2)).toEqual(["daylight", "midnight"]);
    expect(paletteKeys).toHaveLength(12);
  });
});
