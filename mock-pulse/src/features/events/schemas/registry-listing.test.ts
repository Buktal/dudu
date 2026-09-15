import { describe, expect, it } from "vitest";

import { schemasByChannel } from "./registry";

/**
 * 各渠道模板 id 清单（平台/IM 系：douyin/wecom/xiaohongshu/wechat-mp/
 * wechat-mini/feishu/dingtalk/qq）。自旧 registry.test.ts 按渠道组拆分
 * （单文件 ≤ 500 行，code-review 退件）；交易/海外系在
 * ./registry-listing-trade.test.ts，聚合不变量在 ./registry.test.ts。
 */

describe("schemasByChannel 模板清单（平台/IM 系）", () => {
  it("抖音：dop 主体系 14 + IM 私信明细 11 + 生活服务 2 + 小游戏 4 + 服务商 2", () => {
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
  });

  it("企微：自建应用 XML 通道 + 事件字典 + 通讯录/家校/客户联系/获客/审批/客服/上下游 + 智能机器人 JSON 通道，共 89", () => {
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
  });

  it("小红书：客服接收 5 + 支付回调 2 + 电商 ark 订单推送族 10", () => {
    expect(schemasByChannel("xiaohongshu").map((schema) => schema.id)).toEqual([
      // 客服接收 5 MsgType（事实库 §10.3：通用字段 + MsgType 专属字段）
      "xhs-text",
      "xhs-image",
      "xhs-video",
      "xhs-item",
      "xhs-order",
      // 支付结果回调（事实库 §11.1：主单/预约单共用 PAY_RESULT，OrderType 区分）
      "xhs-pay-result",
      "xhs-pay-result-book",
      // 电商 ark 订单推送族（事实库 §2.2 十事件，多源）
      "xhs-ark-fulfillment-status-change",
      "xhs-ark-fulfillment-receiver-change",
      "xhs-ark-fulfillment-seller-remark-change",
      "xhs-ark-fulfillment-deliver-time-change",
      "xhs-ark-after-sale-create",
      "xhs-ark-after-sale-transfer",
      "xhs-ark-sku-create",
      "xhs-ark-sku-buyable",
      "xhs-ark-sku-delete",
      "xhs-ark-item-audit-reject",
    ]);
  });

  it("公众号：普通消息 7 + 基础事件 6 + 菜单扩展 8 + 模板/群发/订阅通知回执 5", () => {
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
  });

  it("小程序：客服接收三包 + 进入会话 + 授权变更三事件", () => {
    expect(schemasByChannel("wechat-mini").map((schema) => schema.id)).toEqual([
      // 客服接收三包（事实库 §2.1：receive.html 全页仅此三包）
      "wmn-text",
      "wmn-image",
      "wmn-miniprogrampage",
      // 进入会话事件（事实库 §2.2：user_enter_tempsession，无 user_enter_session）
      "wmn-enter-tempsession",
      // 授权变更三事件（事实库 §2.4）
      "wmn-user-info-modified",
      "wmn-auth-revoke",
      "wmn-auth-cancellation",
    ]);
  });

  it("飞书：url_verification 握手 + IM 消息三事件 + 群组/通讯录/审批", () => {
    expect(schemasByChannel("feishu").map((schema) => schema.id)).toEqual([
      // url_verification 握手（事实库 §3.2/§5.1）
      "fs-url-verification",
      // IM 消息三事件（事实库 §2.1：真名 message_read/recalled）
      "fs-message-receive",
      "fs-message-read",
      "fs-message-recalled",
      // 群组/通讯录/审批（事实库 §2.2–§2.4）
      "fs-bot-added",
      "fs-contact-deleted",
      "fs-approval-updated",
    ]);
  });

  it("钉钉：回调握手系 + 审批双信封 + 通讯录双信封 + 机器人收消息 6 msgtype", () => {
    expect(schemasByChannel("dingtalk").map((schema) => schema.id)).toEqual([
      // 回调握手系（事实库 §5.6：解密后明文）
      "dt-check-url",
      "dt-check-create-suite-url",
      "dt-check-update-suite-url",
      "dt-suite-ticket",
      // 审批双信封（事实库 §5.4：大写 HTTP 信封）
      "dt-bpms-instance-change",
      "dt-bpms-task-change",
      // 通讯录双信封（事实库 §5.2/§5.3）
      "dt-user-modify-org",
      "dt-user-leave-org",
      // 机器人收消息（事实库 §5.1：明文 6 msgtype）
      "dt-bot-text",
      "dt-bot-picture",
      "dt-bot-audio",
      "dt-bot-video",
      "dt-bot-file",
      "dt-bot-richtext",
    ]);
  });

  it("QQ：op13 验证回调 + 单聊/群消息 + 频道消息 + 关系链", () => {
    expect(schemasByChannel("qq").map((schema) => schema.id)).toEqual([
      // op13 验证回调（事实库 §3.2：官方验证回调请求逐字）
      "qq-op13-verify",
      // 单聊/群消息（事实库 §5.3/§5.4/§5.12）
      "qq-c2c-message-create",
      "qq-group-at-message-create",
      "qq-group-message-create",
      // 频道消息（事实库 §5.7：Message 对象）
      "qq-at-message-create",
      "qq-direct-message-create",
      // 关系链（事实库 §5.5/§5.6）
      "qq-friend-add",
      "qq-group-add-robot",
    ]);
  });
});
