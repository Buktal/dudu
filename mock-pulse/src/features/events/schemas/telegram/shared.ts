import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import membersDefinitions from "../../definitions/telegram/telegram-members.json";
import messagesDefinitions from "../../definitions/telegram/telegram-messages.json";
import postsDefinitions from "../../definitions/telegram/telegram-posts.json";
import queriesDefinitions from "../../definitions/telegram/telegram-queries.json";
import type { ExpectedReceipt, WirePayload } from "../types";

/**
 * Telegram 渠道协议元数据公共体（事实库 docs/research/channels/telegram.md，
 * Bot Webhook）：
 * - 传输（§3.1/§4.2）：HTTPS POST，body 为 JSON 序列化的 Update 对象（明文，
 *   事件体不做应用层加密——无 Encrypt Key 概念）；端口 443/80/88/8443、IPv4
 *   only、TLS1.2+ 为服务端约束；长轮询 getUpdates 与 Webhook 互斥（24h 暂存）
 * - 验证（§4.1 逐字）：恒等头 X-Telegram-Bot-Api-Secret-Token = setWebhook
 *   配置的 secret_token 原样回显，1–256 字符、仅 A-Z a-z 0-9 _ -，校验 =
 *   字符串相等比较——四渠道对照中唯一无 HMAC/无签名的（头由 Rust 适配器携带）
 * - 握手（§3.2）：官方无 challenge/echostr 式验证，setWebhook 同步返回 True
 *   即成功——连接测试 = 合规 Update 样本直发探针（语义同普通推送，同京东先例）
 * - 应答（§3.3/§附速查）：成功判 2XY；非 2XY「按合理次数重推」（精确时刻表
 *   官方未公开 → 待核验(09-27)）
 * - 去重（§2.1）：update_id 正整数顺序递增，Webhook 下凭它忽略重复/恢复乱序
 *   （空闲 ≥1 周后下一个随机）——消费方幂等键，新建事件重生成
 * - 模板（§2.2 Update 27 类取高频 7 类，官方核验样本逐字 + 构造注明）：
 *   message / callback_query 取 §5.2 webhooks 指南官方自测样本逐字；
 *   edited_message 按「结构同上」口径构造；channel_post/edited_channel_post
 *   按 message 同构构造（频道样本未给，占位注明）；my_chat_member/chat_member
 *   载荷样本未给——空对象占位、订阅语义由信封字段名承载
 * 字段说明与版本/来源由 definitions/telegram/ 分域描述文件装载即校验后合并。
 */

/**
 * 版本化字段描述文件：按域分四份（消息二条 messages / 频道帖二条 posts /
 * 回调查询 queries / 成员变更二条 members），装载即校验（坏文件启动即炸）
 * 后合并。
 */
export const TG_DEFINITIONS = mergeChannelDefinitions(
  [
    messagesDefinitions,
    postsDefinitions,
    queriesDefinitions,
    membersDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 官方成功语义（§3.3/§附速查）：成功判 2XY；非 2XY 按合理次数重推（时刻表
 * 待核验(09-27)）。应答正文无官方口径——空串 = 只看状态码。
 */
export const TG_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * Update 信封骨架（§5.2 官方样本键序：update_id 在前、事件字段在后；任一
 * Update 至多含一个可选事件字段）：事件字段名即判型字段，由调用方覆写。
 */
export function tgUpdateEnvelope(
  field: string,
  value: WirePayload,
): WirePayload {
  return { update_id: 10000, [field]: value };
}
