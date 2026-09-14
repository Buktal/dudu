import { FEISHU_EVENT_SCHEMAS } from "./feishu/events";
import { FEISHU_IM_SCHEMAS } from "./feishu/im";
import { FEISHU_DEFINITIONS } from "./feishu/shared";
import { FEISHU_VERIFICATION_SCHEMAS } from "./feishu/verification";

/**
 * 飞书渠道协议元数据（Webhook 子形态 JSON v2.0，事实库 §2/§3/§5）：
 * url_verification 握手 1（feishu/verification，challenge 三参逐字）
 * + IM 消息 3（feishu/im：receive/message_read/recalled，官方真名照录）
 * + 群组/通讯录/审批 3（feishu/events：bot.added/contact.deleted/approval.updated）。
 * 载荷逐字取自 docs/research/channels/feishu.md 核验样本；字段说明与版本/
 * 来源由 definitions/feishu/ 分域描述文件装载即校验。POST challenge 握手、
 * X-Lark-Signature（sha256(timestamp+nonce+encrypt_key+body)）验签与
 * AES-256-CBC 加密信封（key=sha256(encrypt_key)、IV 前 16B）由 Rust 适配器
 * 完成；事实库「待核验(09-27)」的其余事件族不进本票——官方无载荷正文，不编造。
 */

export { FEISHU_DEFINITIONS };

export const FEISHU_SCHEMAS = [
  ...FEISHU_VERIFICATION_SCHEMAS,
  ...FEISHU_IM_SCHEMAS,
  ...FEISHU_EVENT_SCHEMAS,
] as const;
