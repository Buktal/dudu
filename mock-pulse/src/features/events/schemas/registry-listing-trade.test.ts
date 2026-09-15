import { describe, expect, it } from "vitest";

import { CHANNELS } from "@/lib/channels";

import { schemasByChannel } from "./registry";

/**
 * 各渠道模板 id 清单（交易/海外系：weibo/kuaishou/taobao/jingdong/pinduoduo/
 * meituan/eleme/bilibili/alipay/whatsapp/telegram）。自旧 registry.test.ts
 * 按渠道组拆分（单文件 ≤ 500 行，code-review 退件）；平台/IM 系在
 * ./registry-listing.test.ts，聚合不变量在 ./registry.test.ts。
 */

describe("schemasByChannel 模板清单（交易/海外系）", () => {
  it("微博：私信四 type + 事件八 subtype（mention 已暂停不收）", () => {
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
  });

  it("快手：开放域 WebHook 3 + 小程序支付回调族 5", () => {
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
  });

  it("淘宝：交易/退款代表事件 2 + 全球栈 HTTP 回调 2 + OpenIM 离线消息 1", () => {
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
  });

  it("京东：订单 9 状态推送 + 售后全流程消息 1 + 咚咚 2", () => {
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
  });

  it("拼多多：订单三态推送（1-待发货/2-已发货/3-已签收，三态穷尽）", () => {
    expect(schemasByChannel("pinduoduo").map((schema) => schema.id)).toEqual([
      // 订单三态推送（事实库 §2.1 状态照录 1/2/3，三态穷尽）
      "pdd-order-wait-delivery",
      "pdd-order-shipped",
      "pdd-order-signed",
    ]);
  });

  it("美团：订单三态推送 + IM 单聊回调", () => {
    expect(schemasByChannel("meituan").map((schema) => schema.id)).toEqual([
      // 订单三态推送（事实库 §2.1 目录行接口名逐字，必接与官方全文推送）
      "mt-order-paid",
      "mt-order-confirmed",
      "mt-order-completed",
      // IM 单聊回调 1（事实库 §5.4 docDetail/842 字段表逐字，biz_type=1）
      "mt-im-single-chat",
    ]);
  });

  it("饿了么：v2 订单四推送 + H5 表单推送 2（赔偿注明暂不开放）", () => {
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
  });

  it("B站：封闭 4 事件（deauthorize 官方印证 + 其余三行镜像口径）", () => {
    expect(schemasByChannel("bilibili").map((schema) => schema.id)).toEqual([
      // 封闭 4 事件（事实库 §2.2 事件表；deauthorize 官方印证 + 其余三行镜像口径）
      "bili-authorize",
      "bili-deauthorize",
      "bili-video-open",
      "bili-video-fail",
    ]);
  });

  it("支付宝：支付异步通知 1 + 应用网关 / From 蚂蚁订阅代表 2", () => {
    expect(schemasByChannel("alipay").map((schema) => schema.id)).toEqual([
      // 支付异步通知 1（事实库 §5.1 公共参数表 + 业务参数表逐字，notify_url 代表）
      "ali-notify-trade-status-sync",
      // 应用网关 / From 蚂蚁订阅代表 2（事实库 §2.2 topic 接口名逐字）
      "ali-gateway-appauth-cancelled",
      "ali-gateway-fund-trans-changed",
    ]);
  });

  it("WhatsApp：入站文本 1 + 出站状态 4 + 管理面组件事件 4", () => {
    expect(schemasByChannel("whatsapp").map((schema) => schema.id)).toEqual([
      // 入站文本 1（事实库 §5.1 set-up-webhooks 页核验样本逐字）
      "wa-inbound-text",
      // 出站状态 4（§2.1 状态枚举；delivered §5.2 核验样本逐字，其余构造）
      "wa-status-delivered",
      "wa-status-sent",
      "wa-status-read",
      "wa-status-failed",
      // 管理面组件事件 4（§2.2 组件表；模板状态/号码吞吐 §5.4/§5.5 逐字）
      "wa-template-status-update",
      "wa-phone-quality-update",
      "wa-capability-update",
      "wa-account-update",
    ]);
  });

  it("Telegram：消息族 4 + 回调查询 1 + 成员变更 2", () => {
    expect(schemasByChannel("telegram").map((schema) => schema.id)).toEqual([
      // 消息族 4（事实库 §5.2 message 样本逐字 + edited_message「结构同上」
      // 口径 + channel_post 族按 message 同构构造）
      "tg-update-message",
      "tg-update-edited-message",
      "tg-update-channel-post",
      "tg-update-edited-channel-post",
      // 回调查询 1（§5.2 官方样本逐字）
      "tg-update-callback-query",
      // 成员变更 2（§2.2 Update 表；ChatMemberUpdated 载荷样本未给，空对象占位）
      "tg-update-my-chat-member",
      "tg-update-chat-member",
    ]);
  });

  it("渠道注册表中其余未接入模板的渠道返回空表（知乎无推送不入表）", () => {
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
          "bilibili",
          "alipay",
          "whatsapp",
          "telegram",
        ].includes(channel.id)
      )
        continue;
      expect(schemasByChannel(channel.id), channel.id).toEqual([]);
    }
  });
});
