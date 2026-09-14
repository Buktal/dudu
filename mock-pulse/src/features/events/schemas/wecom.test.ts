import { describe, expect, it } from "vitest";

import { WECOM_DEFINITIONS, WECOM_EVENT_SCHEMAS } from "./wecom";

describe("企业微信事件 schema 聚合（XML + 机器人 JSON 两条通道）", () => {
  it("自建应用 6 消息 + 26 事件 + 机器人 11 共 43 个模板，id 全仓库唯一", () => {
    expect(WECOM_EVENT_SCHEMAS).toHaveLength(43);
    const ids = WECOM_EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
    // 自建应用 XML 通道：成员消息 6 MsgType（事实库 §2.1）+ 事件字典 26 Event（§2.2）
    const agentSchemas = WECOM_EVENT_SCHEMAS.filter((schema) =>
      schema.id.startsWith("wc-"),
    );
    expect(agentSchemas).toHaveLength(32);
    expect(
      agentSchemas.filter((schema) => schema.kind === "message"),
    ).toHaveLength(6);
    expect(
      agentSchemas.filter((schema) => schema.kind === "event"),
    ).toHaveLength(26);
    // 机器人 JSON 通道：7 msgtype 收消息 + 4 种收事件（事实库 §2.10）
    expect(
      WECOM_EVENT_SCHEMAS.filter((schema) => schema.id.startsWith("wb-")),
    ).toHaveLength(11);
  });

  it("描述文件分文件合并装载合法，且模板条目与协议模块一一对应", () => {
    expect(WECOM_DEFINITIONS.channelId).toBe("wecom");
    expect(WECOM_DEFINITIONS.version).toBe("2026.09");
    expect(Object.keys(WECOM_DEFINITIONS.schemas).sort()).toEqual(
      WECOM_EVENT_SCHEMAS.map((schema) => schema.id).sort(),
    );
  });

  it("通道与线上形态绑定：wc-* 走 XML（带排版规则），wb-* 走 JSON", () => {
    for (const schema of WECOM_EVENT_SCHEMAS) {
      if (schema.id.startsWith("wc-")) {
        expect(schema.wire, `${schema.id} wire`).toBe("xml");
        expect(schema.xmlLayout, `${schema.id} xmlLayout`).toBeDefined();
      } else {
        expect(schema.id.startsWith("wb-"), `${schema.id} 前缀`).toBe(true);
        expect(schema.wire, `${schema.id} wire`).toBe("json");
        expect(schema.xmlLayout, `${schema.id} xmlLayout`).toBeUndefined();
      }
    }
  });

  it("每个字段都有标题/类型/分组/解释，且聊天回调不伪造昵称/头像（通讯录域除外）", () => {
    for (const schema of WECOM_EVENT_SCHEMAS) {
      for (const field of schema.fields) {
        expect(field.title, `${schema.id}.${field.path} title`).toBeTruthy();
        expect(field.type, `${schema.id}.${field.path} type`).toBeTruthy();
        expect(field.group, `${schema.id}.${field.path} group`).toBeTruthy();
        expect(
          field.description,
          `${schema.id}.${field.path} description`,
        ).toBeTruthy();
      }
      if (schema.id === "wc-change-contact") continue; // 官方 §5.4 通讯录事件携带 Avatar
      const joined = schema.fields.map((field) => field.path).join(" ");
      expect(joined, `${schema.id} 不得伪造昵称/头像`).not.toMatch(
        /nick|avatar|头像|昵称/i,
      );
    }
  });

  it("事件字典 26 Event 与官方目录逐一对应（含 LOCATION 全大写）", () => {
    const eventNames = WECOM_EVENT_SCHEMAS.filter(
      (schema) => schema.id.startsWith("wc-") && schema.kind === "event",
    ).map((schema) => schema.eventName);
    expect(eventNames).toEqual([
      "subscribe",
      "unsubscribe",
      "enter_agent",
      "LOCATION",
      "batch_job_result",
      "change_contact",
      "click",
      "view",
      "view_miniprogram",
      "scancode_push",
      "scancode_waitmsg",
      "pic_sysphoto",
      "pic_photo_or_album",
      "pic_weixin",
      "location_select",
      "open_approval_change",
      "share_agent_change",
      "share_chain_change",
      "template_card_event",
      "template_card_menu_event",
      "inactive_alert",
      "close_inactive_agent",
      "reopen_inactive_agent",
      "low_active_alert",
      "low_active",
      "active_restored",
    ]);
  });

  it("系统生成事件的 FromUserName 固定 sys，成员事件保持 UserID", () => {
    const sysEvents = [
      "wc-change-contact",
      "wc-share-agent-change",
      "wc-share-chain-change",
      "wc-inactive-alert",
      "wc-close-inactive-agent",
      "wc-low-active-alert",
      "wc-low-active",
      "wc-active-restored",
    ];
    for (const schema of WECOM_EVENT_SCHEMAS) {
      if (!sysEvents.includes(schema.id)) continue;
      expect(schema.payload.FromUserName, `${schema.id} FromUserName`).toBe(
        "sys",
      );
    }
    expect(
      WECOM_EVENT_SCHEMAS.find((s) => s.id === "wc-enter")?.payload
        .FromUserName,
    ).toBe("UserID");
  });

  it("默认期望回执 = 渠道真实应答：HTTP 200，企微回执形态且留空（5 秒窗口）", () => {
    for (const schema of WECOM_EVENT_SCHEMAS) {
      expect(schema.expected, `${schema.id} expected`).toEqual({
        status: 200,
        body: "",
        bodyMode: "wecomReply",
      });
    }
  });
});
