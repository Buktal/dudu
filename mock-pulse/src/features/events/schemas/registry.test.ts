import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/lib/channels";

import { defineSchema } from "./define";
import { DOUYIN_DEFINITIONS } from "./douyin";
import { EVENT_SCHEMAS, schemaById, schemasByChannel } from "./registry";
import { MP_DEFINITIONS } from "./wechat-mp";
import { WECOM_DEFINITIONS } from "./wecom";

const DEFINITIONS_BY_CHANNEL = {
  douyin: DOUYIN_DEFINITIONS,
  wecom: WECOM_DEFINITIONS,
  "wechat-mp": MP_DEFINITIONS,
} as const;

describe("事件模板聚合注册表", () => {
  it("抖音 33 + 企微 89 + 公众号 26 个模板全部入表，id 全仓库唯一", () => {
    expect(EVENT_SCHEMAS).toHaveLength(148);
    const ids = EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个模板的 channelId 与所在渠道包一致（协议模块与描述文件同渠道）", () => {
    for (const channelId of ["douyin", "wecom", "wechat-mp"] as const) {
      const definitions = DEFINITIONS_BY_CHANNEL[channelId];
      for (const schema of schemasByChannel(channelId)) {
        expect(schema.channelId).toBe(channelId);
        expect(definitions.channelId).toBe(channelId);
      }
    }
  });

  it("模板版本/来源/字段与描述文件同源（装载即校验后的数据契约）", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(schema.channelId in DEFINITIONS_BY_CHANNEL, schema.channelId).toBe(
        true,
      );
      const entry =
        DEFINITIONS_BY_CHANNEL[
          schema.channelId as keyof typeof DEFINITIONS_BY_CHANNEL
        ].schemas[schema.id];
      expect(entry, `${schema.id} 描述文件条目`).toBeDefined();
      expect(schema.version).toBe(entry?.version);
      expect(schema.source).toBe(entry?.source);
      expect(schema.fields).toEqual(entry?.fields);
    }
  });

  it("每个模板带渠道真实默认期望回执：状态码合法、正文形态在枚举内", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(
        schema.expected.status,
        `${schema.id} status`,
      ).toBeGreaterThanOrEqual(100);
      expect(schema.expected.status, `${schema.id} status`).toBeLessThanOrEqual(
        599,
      );
      expect(["contains", "equals", "jsonField", "wecomReply"]).toContain(
        schema.expected.bodyMode,
      );
    }
  });

  it("schemasByChannel：已接入渠道返回模板，其余 16 渠道返回空表", () => {
    expect(schemasByChannel("douyin").map((schema) => schema.id)).toEqual([
      // dop 主体系
      "dy-create-video",
      "dy-authorize",
      "dy-unauthorize",
      "dy-contract-authorize",
      "dy-contract-unauthorize",
      "dy-union-auth-c",
      "dy-union-auth-b",
      "dy-new-video-digg",
      "dy-new-follow",
      "dy-group-audit",
      "dy-group-fans",
      "dy-im-group-receive",
      "dy-im-group-send",
      "dy-service-market-order",
      // IM 私信明细
      "dy-text",
      "dy-image",
      "dy-emoji",
      "dy-video",
      "dy-local-image",
      "dy-retain-card",
      "dy-leads-phone-card",
      "dy-send-text",
      "dy-enter",
      "dy-recall",
      "dy-read",
      // 生活服务
      "dy-verify-webhook",
      "dy-life-order",
      // 小游戏
      "dy-mg-verify",
      "dy-mg-gift",
      "dy-mg-im-text",
      "dy-mg-im-image",
      // 服务商
      "dy-isv-ticket",
      "dy-isv-authorized",
    ]);
    expect(schemasByChannel("wecom").map((schema) => schema.id)).toEqual([
      // 自建应用 XML 通道：成员消息 6 MsgType
      "wc-text",
      "wc-image",
      "wc-voice",
      "wc-video",
      "wc-location",
      "wc-link",
      // 事件字典 26 Event
      "wc-subscribe",
      "wc-unsubscribe",
      "wc-enter",
      "wc-location-report",
      "wc-batch-job-result",
      "wc-change-contact",
      "wc-click",
      "wc-view",
      "wc-view-miniprogram",
      "wc-scancode-push",
      "wc-scancode-waitmsg",
      "wc-pic-sysphoto",
      "wc-pic-photo-or-album",
      "wc-pic-weixin",
      "wc-location-select",
      "wc-open-approval-change",
      "wc-share-agent-change",
      "wc-share-chain-change",
      "wc-template-card-event",
      "wc-template-card-menu-event",
      "wc-inactive-alert",
      "wc-close-inactive-agent",
      "wc-reopen-inactive-agent",
      "wc-low-active-alert",
      "wc-low-active",
      "wc-active-restored",
      // 通讯录/家校变更（§2.3/§2.4）
      "wc-update-user",
      "wc-delete-user",
      "wc-create-party",
      "wc-update-party",
      "wc-delete-party",
      "wc-update-tag",
      "wc-school-create-student",
      "wc-school-update-student",
      "wc-school-delete-student",
      "wc-school-create-parent",
      "wc-school-update-parent",
      "wc-school-delete-parent",
      "wc-school-subscribe",
      "wc-school-unsubscribe",
      "wc-school-create-deparmtment",
      "wc-school-update-deparmtment",
      "wc-school-delete-deparmtment",
      // 客户联系（§2.5）
      "wc-add-external-contact",
      "wc-edit-external-contact",
      "wc-add-half-external-contact",
      "wc-del-external-contact",
      "wc-del-follow-user",
      "wc-transfer-fail",
      "wc-external-chat-create",
      "wc-external-chat-update",
      "wc-external-chat-dismiss",
      "wc-external-tag-create",
      "wc-external-tag-update",
      "wc-external-tag-delete",
      "wc-external-tag-shuffle",
      // 获客助手（§2.9）/ 审批（§2.7）/ 微信客服（§2.6）
      "wc-customer-acquisition",
      "wc-sys-approval-change",
      "wc-kf-msg-or-event",
      // 上下游（§2.8）
      "wc-chain-corp-join",
      "wc-chain-create-chain",
      "wc-chain-update-chain",
      "wc-chain-delete-chain",
      "wc-chain-create-group",
      "wc-chain-update-group",
      "wc-chain-delete-group",
      "wc-chain-remove-corp",
      "wc-chain-update-corp",
      // 会议室 / 域名 IP / 公共邮箱（§2.11）
      "wc-book-meeting-room",
      "wc-cancel-meeting-room",
      "wc-security-change-domain-ip",
      "wc-public-email-receive",
      // 智能机器人 JSON 通道：收消息 7 msgtype + 收事件 4 种
      "wb-text",
      "wb-quote",
      "wb-mixed",
      "wb-image",
      "wb-voice",
      "wb-file",
      "wb-video",
      "wb-event",
      "wb-event-enter-chat",
      "wb-event-template-card",
      "wb-event-template-card-menu",
    ]);
    expect(schemasByChannel("wechat-mp").map((schema) => schema.id)).toEqual([
      // 普通消息 7 MsgType（事实库 §2.1）
      "wm-text",
      "wm-image",
      "wm-voice",
      "wm-video",
      "wm-shortvideo",
      "wm-location",
      "wm-link",
      // 基础事件 6 种（事实库 §2.2）
      "wm-subscribe",
      "wm-unsubscribe",
      "wm-scan",
      "wm-location-report",
      "wm-click",
      "wm-view",
      // 菜单扩展 8 形态（§2.3；CLICK 重申与基础事件共用 wm-click）
      "wm-scancode-push",
      "wm-scancode-waitmsg",
      "wm-pic-sysphoto",
      "wm-pic-photo-or-album",
      "wm-pic-weixin",
      "wm-location-select",
      "wm-view-menu",
      "wm-view-miniprogram",
      // 模板/群发/订阅通知回执（事实库 §2.4/§2.5）
      "wm-template-send-job-finish",
      "wm-masssend-job-finish",
      "wm-subscribe-msg-popup",
      "wm-subscribe-msg-change",
      "wm-subscribe-msg-sent",
    ]);
    for (const channel of CHANNELS) {
      if (["douyin", "wecom", "wechat-mp"].includes(channel.id)) continue;
      expect(schemasByChannel(channel.id), channel.id).toEqual([]);
    }
  });

  it("schemaById：全表命中，未命中抛出明确错误", () => {
    for (const schema of EVENT_SCHEMAS) {
      expect(schemaById(schema.id).id).toBe(schema.id);
    }
    expect(() => schemaById("missing")).toThrow("未知事件模板");
  });

  it("defineSchema：描述文件缺条目时装载即炸（协议模块与文件脱节）", () => {
    expect(() =>
      defineSchema(DOUYIN_DEFINITIONS, "dy-missing", {
        eventName: "x",
        name: "x",
        kind: "event",
        contentString: false,
        wire: "json",
        expected: { status: 200, body: "", bodyMode: "contains" },
        idGenerations: [],
        payload: {},
      }),
    ).toThrow("未知事件模板的字段定义");
  });
});
