import { WB_EVENT_SCHEMAS } from "./weibo/events";
import { WB_MESSAGE_SCHEMAS } from "./weibo/messages";
import { WB_DEFINITIONS } from "./weibo/shared";

/**
 * 微博渠道协议元数据（粉丝服务平台 Webhook，JSON 默认格式，事实库 §2/§3/§5）：
 * 私信 4（weibo/messages：text/position/voice/image 四官方样本逐字，type 直接
 * 判型）+ 事件 8（weibo/events：follow/unfollow/subscribe/unsubscribe/scan/
 * scan_follow/click/view，type:"event" + data.subtype 判型；mention 已暂停
 * 不收）。载荷骨架 type/receiver_id/sender_id/created_at/text/data 逐字取自
 * docs/research/channels/weibo.md 核验样本；排重键 sender_id + created_at。
 * GET 四参握手（sha1(排序(appsecret,timestamp,nonce)) 验签 + 原样回 echostr，
 * 黄金算例 xyz123xyz → 90e4c22c…）与 URL 三参签名直发由 Rust 适配器完成；
 * set_format 可切微信 XML（事实库 §2.4），本票取 JSON 主形态。
 */

export { WB_DEFINITIONS };

export const WB_SCHEMAS = [...WB_MESSAGE_SCHEMAS, ...WB_EVENT_SCHEMAS] as const;
