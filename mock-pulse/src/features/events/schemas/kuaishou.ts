import { KS_CS_SCHEMAS } from "./kuaishou/cs";
import { KS_OPEN_EVENT_SCHEMAS } from "./kuaishou/open";
import { KS_PAY_SCHEMAS } from "./kuaishou/pay";
import { KS_DEFINITIONS } from "./kuaishou/shared";

/**
 * 快手渠道协议元数据（三面并行，事实库 docs/research/channels/kuaishou.md）：
 * 开放域 WebHook 3（kuaishou/open：TEST 配地址握手/AUTHORIZE/UN_AUTHORIZE，
 * `event` 判型信封五字段）+ 小程序支付回调族 5（kuaishou/pay：PAYMENT/REFUND/
 * SETTLE/WITHHOLD/CONTRACT，`biz_type` 判型信封）+ 电商智能客服推送 6
 * （kuaishou/cs：心跳/文本/图片/商品卡片/订单卡片/转接，`type` 判型
 * requestId 信封）。开放域验签/应答同族：kwaisign = MD5(body + app_secret)
 * 头验签（无 AES），应答 200 + result=1 并回传 message_id；智能客服面
 * Ks-Sign = MD5(AppKey + body)（拼接顺序相反），应答 result=1 无回传——
 * 验签与握手/心跳探针由 Rust 适配器按连接的推送通道路由完成。
 */

export { KS_DEFINITIONS };

export const KS_SCHEMAS = [
  ...KS_OPEN_EVENT_SCHEMAS,
  ...KS_PAY_SCHEMAS,
  ...KS_CS_SCHEMAS,
] as const;
