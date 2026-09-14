import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_CARD_EVENT_SCHEMAS } from "./cards";

describe("企微事件字典 · 审批/共享应用/模板卡片", () => {
  it("提供五个模板且事件名与官方目录一致", () => {
    expect(WECOM_AGENT_CARD_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-open-approval-change",
      "wc-share-agent-change",
      "wc-share-chain-change",
      "wc-template-card-event",
      "wc-template-card-menu-event",
    ]);
    expect(schemaById("wc-open-approval-change").eventName).toBe(
      "open_approval_change",
    );
  });

  it("审批事件携带 ApprovalInfo 结构体（SpNo/SpStatus/StatuChangeEvent）", () => {
    const info = schemaById("wc-open-approval-change").payload.ApprovalInfo;
    expect(info).toContain("<ApprovalInfo>");
    expect(info).toContain("<SpStatus>1</SpStatus>");
    expect(info).toContain("StatuChangeEvent");
  });

  it("模板卡片按钮事件：EventKey=btn:key + TaskId/CardType/ResponseCode", () => {
    expect(schemaById("wc-template-card-event").payload).toMatchObject({
      Event: "template_card_event",
      EventKey: "btn:EVENTKEY",
      TaskId: "TASK_ID",
      CardType: "button_interaction",
      ResponseCode: "RESPONSE_CODE",
    });
    expect(schemaById("wc-template-card-menu-event").payload).toMatchObject({
      Event: "template_card_menu_event",
      TaskId: "TASK_ID",
      CardType: "text_notice",
    });
  });

  it("共享应用变更（企业互联/上下游）FromUserName 固定 sys", () => {
    expect(schemaById("wc-share-agent-change").payload.FromUserName).toBe(
      "sys",
    );
    expect(schemaById("wc-share-chain-change").payload.FromUserName).toBe(
      "sys",
    );
  });
});
