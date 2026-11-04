import { XHS_ARK_SCHEMAS } from "./xiaohongshu/ark";
import { XHS_MINIAPP_SCHEMAS } from "./xiaohongshu/miniapp";
import { XHS_DEFINITIONS } from "./xiaohongshu/shared";
import { XHS_THIRD_SCHEMAS } from "./xiaohongshu/third";

/**
 * 小红书渠道协议元数据（三体系，事实库 docs/research/channels/xiaohongshu.md
 * 与 xiaohongshu-third-im-spec.md）：小程序客服消息 5 MsgType + 支付结果回调 2
 * （主单/预约单）+ 事件回调核验范围内条目（xhs/miniapp：§10.7 事件回调族仅
 * PAY_RESULT 有官方字段表正文，其余目录级条目无载荷不设模板）+ 电商 ark 订单
 * 推送族 10（xhs/ark，多源标注以事实库口径为准）+ 三方私信线索推送 1
 * （xhs/third：消息级推送信封未公开仅线索面）。载荷逐字取自核验样本/字段表；
 * 小程序通道加密信封 {Nonce,Timestamp,Encrypt,MsgSignature} + AES（官方
 * MsgDecrypt 同族）、ark 数组包裹与 third 面 X-Red-Signature 签名头由 Rust
 * 适配器完成。
 */

export { XHS_DEFINITIONS };

export const XHS_SCHEMAS = [
  ...XHS_MINIAPP_SCHEMAS,
  ...XHS_ARK_SCHEMAS,
  ...XHS_THIRD_SCHEMAS,
] as const;
