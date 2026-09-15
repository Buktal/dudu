import { defineSchema } from "../define";
import type { EventSchema } from "../types";
import { ALI_DEFINITIONS, ALI_EXPECTED } from "./shared";

/**
 * 应用网关与 From 蚂蚁订阅代表事件（事实库 §2.2/§3.1）：POST 表单（wire =
 * form，From 蚂蚁「默认以 POST 方式发送通知消息给配置的应用网关地址」逐字，
 * 应用网关同为 POST）到应用网关地址（全应用仅 1 个，开发设置配置）。两代表：
 * - 应用网关代表 = 第三方应用授权取消消息（alipay.open.auth.appauth.cancelled，
 *   §2.2 topic 示例值逐字——商户取消对 ISV 的应用授权时触发）
 * - From 蚂蚁订阅代表 = 单笔转账单据状态变更（alipay.fund.trans.order.changed，
 *   创建应用页开发设置表 topic 逐字——转账/现金红包单据状态变更触发，订阅制：
 *   需先 alipay.open.app.message.topic.subscribe 或消息服务自订阅）
 * 官方未给该二消息载荷样本（§7-3/§7-9 待核验）：信封字段收 §5.1 公共参数族
 * 词汇（值取样本形态占位并注明），业务字段仅 topic 接口名逐字承载订阅语义；
 * 生活号被动通知事件表待核验(09-27)不收录，网关验证握手细节待核验勿硬编码
 * （§3.2/附）。验签/应答/重试与 notify_url 同一统一规则（§4.3/§3.3）。
 */

/** 官方已实锤 topic（§2.2 表逐字）+ 两地址代表 */
const GATEWAY_MESSAGES = [
  {
    id: "ali-gateway-appauth-cancelled",
    eventName: "alipay.open.auth.appauth.cancelled",
    name: "应用网关消息·第三方应用授权取消（alipay.open.auth.appauth.cancelled）",
    topic: "alipay.open.auth.appauth.cancelled",
    notifyType: "app_auth_cancelled",
    source: "https://opendocs.alipay.com/common/06tsxc",
  },
  {
    id: "ali-gateway-fund-trans-changed",
    eventName: "alipay.fund.trans.order.changed",
    name: "From 蚂蚁订阅·单笔转账单据状态变更（alipay.fund.trans.order.changed）",
    topic: "alipay.fund.trans.order.changed",
    notifyType: "fund_trans_changed",
    source: "https://opendocs.alipay.com/open/03k9zr",
  },
] as const;

export const ALI_GATEWAY_SCHEMAS: readonly EventSchema[] = GATEWAY_MESSAGES.map(
  (message) =>
    defineSchema(ALI_DEFINITIONS, message.id, {
      eventName: message.eventName,
      name: message.name,
      kind: "event",
      contentString: false,
      wire: "form",
      expected: ALI_EXPECTED,
      // notify_id 幂等键（§3.4）——新建事件即新通知按 §5.1 样本形态重生成
      idGenerations: [{ path: "notify_id", kind: "aliNotifyId" }],
      payload: {
        notify_time: "2026-09-15 10:00:00",
        notify_type: message.notifyType,
        notify_id: "3f0a7c8d92e54b16a0d4c8f21e7b9a03d52",
        charset: "utf-8",
        version: "1.0",
        sign_type: "RSA2",
        sign: "SIGN_PLACEHOLDER",
        app_id: "2019082200007148",
        topic: message.topic,
      },
    }),
);
