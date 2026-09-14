import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("企微事件字典 · OA 审批", () => {
  it("sys_approval_change 载荷按 §2.7 标量字段（SpNo/SpNoStr/SpName/SpStatus/StatuChangeEvent）", () => {
    const schema = schemaById("wc-sys-approval-change");
    expect(schema.eventName).toBe("sys_approval_change");
    expect(schema.payload).toMatchObject({
      MsgType: "event",
      Event: "sys_approval_change",
      SpNo: "201904270001",
      SpNoStr: "201904270001",
      SpName: "请假审批",
      SpStatus: "1",
      StatuChangeEvent: "1",
    });
    // SpStatus/SpNo 数值裸文本；SpRecord/SpComment/NotificationMap 官方未收录明细不编造
    expect(schema.xmlLayout?.bareTags).toEqual(
      expect.arrayContaining(["SpNo", "SpStatus"]),
    );
    const paths = schema.fields.map((field) => field.path);
    expect(paths).not.toContain("SpRecord");
    expect(paths).not.toContain("NotificationMap");
  });

  it("SpStatus 描述覆盖 §2.7 的七种状态取值", () => {
    const description =
      schemaById("wc-sys-approval-change").fields.find(
        (field) => field.path === "SpStatus",
      )?.description ?? "";
    for (const value of ["1", "2", "3", "4", "6", "7", "10"]) {
      expect(description).toContain(value);
    }
  });
});
