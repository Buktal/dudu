import { describe, expect, it } from "vitest";
import { firstItemAnchor } from "./message-timeline";

describe("timeline first-item anchoring", () => {
  const messages = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];

  it("decreases as older messages prepend above the base", () => {
    expect(firstItemAnchor(messages, "m1")).toEqual({
      baseId: "m1",
      firstItemIndex: 100000,
    });
    expect(firstItemAnchor([{ id: "m0" }, ...messages], "m1")).toEqual({
      baseId: "m1",
      firstItemIndex: 99999,
    });
  });

  it("re-bases on the current first message once the base leaves the list", () => {
    // 重连 historiesInvalidated 剔除旧缓存后重建的最近页不再包含原基准
    const rebuilt = [{ id: "gap-4" }, { id: "gap-5" }];
    expect(firstItemAnchor(rebuilt, "m1")).toEqual({
      baseId: "gap-4",
      firstItemIndex: 100000,
    });
    // 重算后的基准继续随 prepend 递减，锚定不错位
    expect(firstItemAnchor([{ id: "gap-3" }, ...rebuilt], "gap-4")).toEqual({
      baseId: "gap-4",
      firstItemIndex: 99999,
    });
  });
});
