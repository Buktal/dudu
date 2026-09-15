import { KS_OPEN_EVENT_SCHEMAS } from "./kuaishou/open";
import { KS_PAY_SCHEMAS } from "./kuaishou/pay";
import { KS_DEFINITIONS } from "./kuaishou/shared";

/**
 * 快手渠道协议元数据（双域并行共用同一传输，事实库 docs/research/channels/
 * kuaishou.md）：开放域 WebHook 3（kuaishou/open：TEST 配地址握手/AUTHORIZE/
 * UN_AUTHORIZE，`event` 判型信封五字段）+ 小程序支付回调族 5（kuaishou/pay：
 * PAYMENT/REFUND/SETTLE/WITHHOLD/CONTRACT，`biz_type` 判型信封）。两域验签/
 * 应答同族：kwaisign = MD5(原始 body + app_secret) 头验签（无 AES），应答
 * 200 + result=1 并回传 message_id——验签与 TEST 握手由 Rust 适配器完成。
 */

export { KS_DEFINITIONS };

export const KS_SCHEMAS = [
  ...KS_OPEN_EVENT_SCHEMAS,
  ...KS_PAY_SCHEMAS,
] as const;
