import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/lib/channels";
import { ALI_DEFINITIONS } from "./alipay";
import { defineSchema } from "./define";
import { DINGTALK_DEFINITIONS } from "./dingtalk";
import { DOUYIN_DEFINITIONS } from "./douyin";
import { ELE_DEFINITIONS } from "./eleme";
import { FEISHU_DEFINITIONS } from "./feishu";
import { JD_DEFINITIONS } from "./jingdong";
import { KS_DEFINITIONS } from "./kuaishou";
import { MT_DEFINITIONS } from "./meituan";
import { PDD_DEFINITIONS } from "./pinduoduo";
import { QQ_DEFINITIONS } from "./qq";
import { EVENT_SCHEMAS, schemaById, schemasByChannel } from "./registry";
import { TB_DEFINITIONS } from "./taobao";
import { MINI_DEFINITIONS } from "./wechat-mini";
import { MP_DEFINITIONS } from "./wechat-mp";
import { WECOM_DEFINITIONS } from "./wecom";
import { WB_DEFINITIONS } from "./weibo";
import { XHS_DEFINITIONS } from "./xiaohongshu";

const DEFINITIONS_BY_CHANNEL = {
  douyin: DOUYIN_DEFINITIONS,
  wecom: WECOM_DEFINITIONS,
  xiaohongshu: XHS_DEFINITIONS,
  "wechat-mp": MP_DEFINITIONS,
  "wechat-mini": MINI_DEFINITIONS,
  feishu: FEISHU_DEFINITIONS,
  dingtalk: DINGTALK_DEFINITIONS,
  qq: QQ_DEFINITIONS,
  weibo: WB_DEFINITIONS,
  kuaishou: KS_DEFINITIONS,
  taobao: TB_DEFINITIONS,
  jingdong: JD_DEFINITIONS,
  pinduoduo: PDD_DEFINITIONS,
  meituan: MT_DEFINITIONS,
  eleme: ELE_DEFINITIONS,
  alipay: ALI_DEFINITIONS,
} as const;

describe("事件模板聚合注册表", () => {
  it("抖音 33 + 企微 89 + 小红书 17 + 公众号 26 + 小程序 7 + 飞书 7 + 钉钉 14 + QQ 8 + 微博 12 + 快手 8 + 淘宝 5 + 京东 12 + 拼多多 3 + 美团 4 + 饿了么 6 + 支付宝 3 个模板全部入表，id 全仓库唯一", () => {
    expect(EVENT_SCHEMAS).toHaveLength(254);
    const ids = EVENT_SCHEMAS.map((schema) => schema.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("每个模板的 channelId 与所在渠道包一致（协议模块与描述文件同渠道）", () => {
    for (const channelId of [
      "douyin",
      "wecom",
      "xiaohongshu",
      "wechat-mp",
      "wechat-mini",
      "feishu",
      "dingtalk",
      "qq",
      "weibo",
      "kuaishou",
      "taobao",
      "jingdong",
      "pinduoduo",
      "meituan",
      "eleme",
      "alipay",
    ] as const) {
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
      expect([
        "contains",
        "equals",
        "jsonField",
        "wecomReply",
        "dingtalkReply",
        "qqSignReply",
      ]).toContain(schema.expected.bodyMode);
    }
  });

  it("schemasByChannel：已接入渠道返回模板，其余 4 渠道返回空表", () => {
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
    expect(schemasByChannel("weibo").map((schema) => schema.id)).toEqual([
      // 私信四 type（事实库 §2.1/§5.1–§5.4：type 直接判型）
      "weibo-text",
      "weibo-position",
      "weibo-voice",
      "weibo-image",
      // 事件八 subtype（事实库 §2.2/§5.5–§5.10；mention 已暂停不收）
      "weibo-follow",
      "weibo-unfollow",
      "weibo-subscribe",
      "weibo-unsubscribe",
      "weibo-scan",
      "weibo-scan-follow",
      "weibo-click",
      "weibo-view",
    ]);
    expect(schemasByChannel("kuaishou").map((schema) => schema.id)).toEqual([
      // 开放域 WebHook 3（事实库 §2.1：全目录穷尽仅此三事件，event 判型）
      "ks-test",
      "ks-authorize",
      "ks-un-authorize",
      // 小程序支付回调族 5（事实库 §2.2：biz_type 判型）
      "ks-payment",
      "ks-refund",
      "ks-settle",
      "ks-withhold",
      "ks-contract",
    ]);
    expect(schemasByChannel("taobao").map((schema) => schema.id)).toEqual([
      // 交易/退款代表事件 2（事实库 §5.3/§5.4 topic 核验载荷页逐字）
      "tb-trade-create",
      "tb-refund-created",
      // 全球栈 HTTP 回调 2（事实库 §5.6 接收消息页正向/逆向示例逐字）
      "tb-global-forward",
      "tb-global-reverse",
      // OpenIM 离线消息 1（事实库 §5.8 旺旺 envelope 形态参考）
      "tb-openim-offmsg-push",
    ]);
    expect(schemasByChannel("jingdong").map((schema) => schema.id)).toEqual([
      // 订单 9 状态推送（事实库 §2.1 状态枚举逐字，全目录穷尽）
      "jd-order-wait-seller-stock-out",
      "jd-order-wait-goods-receive-confirm",
      "jd-order-wait-seller-delivery",
      "jd-order-pause",
      "jd-order-finished-l",
      "jd-order-trade-canceled",
      "jd-order-locked",
      "jd-order-pop-order-pause",
      "jd-order-not-pay",
      // 售后全流程消息 1（事实库 §2.2 消息名实锤，载荷骨架从简）
      "jd-afs-step-result",
      // 咚咚 2（事实库 §2.4/§5.3：chat_message4.2 voice 片段 + push2 五参数）
      "jd-dd-chat-message",
      "jd-dd-push2",
    ]);
    expect(schemasByChannel("pinduoduo").map((schema) => schema.id)).toEqual([
      // 订单三态推送（事实库 §2.1 状态照录 1/2/3，三态穷尽）
      "pdd-order-wait-delivery",
      "pdd-order-shipped",
      "pdd-order-signed",
    ]);
    expect(schemasByChannel("meituan").map((schema) => schema.id)).toEqual([
      // 订单三态推送（事实库 §2.1 目录行接口名逐字，必接与官方全文推送）
      "mt-order-paid",
      "mt-order-confirmed",
      "mt-order-completed",
      // IM 单聊回调 1（事实库 §5.4 docDetail/842 字段表逐字，biz_type=1）
      "mt-im-single-chat",
    ]);
    expect(schemasByChannel("eleme").map((schema) => schema.id)).toEqual([
      // v2 订单四推送（事实库 §2.1 目录 + §5.2–§5.5 载荷逐字，赔偿注明暂不开放）
      "ele-order-status-update",
      "ele-order-delivery",
      "ele-order-refund",
      "ele-order-compensate",
      // H5 表单推送 2（事实库 §5.6 push_action 1/2 字段表逐字）
      "ele-h5-order-create",
      "ele-h5-order-status-update",
    ]);
    expect(schemasByChannel("alipay").map((schema) => schema.id)).toEqual([
      // 支付异步通知 1（事实库 §5.1 公共参数表 + 业务参数表逐字，notify_url 代表）
      "ali-notify-trade-status-sync",
      // 应用网关 / From 蚂蚁订阅代表 2（事实库 §2.2 topic 接口名逐字）
      "ali-gateway-appauth-cancelled",
      "ali-gateway-fund-trans-changed",
    ]);
    for (const channel of CHANNELS) {
      if (
        [
          "douyin",
          "wecom",
          "xiaohongshu",
          "wechat-mp",
          "wechat-mini",
          "feishu",
          "dingtalk",
          "qq",
          "weibo",
          "kuaishou",
          "taobao",
          "jingdong",
          "pinduoduo",
          "meituan",
          "eleme",
          "alipay",
        ].includes(channel.id)
      )
        continue;
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
