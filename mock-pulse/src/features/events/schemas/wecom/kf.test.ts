import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";

describe("企微事件字典 · 微信客服", () => {
  it("kf_msg_or_event 逐字复刻官方 §5.6 样本（无 FromUserName/AgentID，三空格缩进）", () => {
    const schema = schemaById("wc-kf-msg-or-event");
    expect(schema.payload).toEqual({
      ToUserName: "ww12345678910",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "kf_msg_or_event",
      Token: "ENCApHxnGDNAVNY4AaSJKj4Tb5mwsEMzxhFmHVGcra996NR",
      OpenKfId: "wkxxxxxxx",
    });
    expect(schema.xmlLayout).toEqual({
      indent: "   ",
      bareTags: ["CreateTime"],
    });
    expect(schema.idGenerations).toEqual([
      { path: "CreateTime", kind: "createTimeSec" },
    ]);
  });

  it("kind 为 event：两段式回调只做通知，消息内容经 sync_msg 拉取（§2.6）", () => {
    const schema = schemaById("wc-kf-msg-or-event");
    expect(schema.kind).toBe("event");
    const token = schema.fields.find((field) => field.path === "Token");
    expect(token?.description).toContain("10 分钟");
  });
});
