import { XHS_ARK_SCHEMAS } from "./xiaohongshu/ark";
import { XHS_MINIAPP_SCHEMAS } from "./xiaohongshu/miniapp";
import { XHS_DEFINITIONS } from "./xiaohongshu/shared";

/**
 * 小红书渠道协议元数据（双体系，事实库 docs/research/channels/xiaohongshu.md）：
 * 小程序客服消息 5 MsgType + 支付结果回调 2（主单/预约单）+ 事件回调核验范围
 * 内条目（xhs/miniapp：§10.7 事件回调族仅 PAY_RESULT 有官方字段表正文，其余
 * 目录级条目无载荷不设模板）+ 电商 ark 订单推送族 10（xhs/ark，多源标注以
 * 事实库口径为准）。载荷逐字取自核验样本/字段表；小程序通道加密信封
 * {Nonce,Timestamp,Encrypt,MsgSignature} + AES（官方 MsgDecrypt 同族）与 ark
 * 数组包裹明文直发由 Rust 适配器完成。
 */

export { XHS_DEFINITIONS };

export const XHS_SCHEMAS = [
  ...XHS_MINIAPP_SCHEMAS,
  ...XHS_ARK_SCHEMAS,
] as const;
