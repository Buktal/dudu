import { describe, expect, it } from "vitest";
import { paletteKeys, palettes } from "./theme-palette";

describe("theme palette order", () => {
  it("offers the eight selected themes with daylight and midnight first", () => {
    expect(paletteKeys.slice(0, 2)).toEqual(["daylight", "midnight"]);
    expect(paletteKeys.map((key) => palettes[key].name)).toEqual([
      "极昼白",
      "极夜黑",
      "栗木红",
      "麦穗金",
      "草木绿",
      "牛仔蓝",
      "烟岚紫",
      "亚麻褐",
    ]);
  });
});
