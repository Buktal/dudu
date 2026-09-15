import { TG_MEMBERS_SCHEMAS } from "./telegram/members";
import { TG_MESSAGES_SCHEMAS } from "./telegram/messages";
import { TG_QUERIES_SCHEMAS } from "./telegram/queries";
import { TG_DEFINITIONS } from "./telegram/shared";

/**
 * Telegram 渠道协议元数据（Bot Webhook，事实库 docs/research/channels/
 * telegram.md）：Update 27 类代表类型收高频 7——消息族 4（tg/messages：
 * message §5.2 官方自测样本逐字 + edited_message「结构同上」口径构造 +
 * channel_post/edited_channel_post 按 message 同构构造，频道样本未给占位
 * 注明）+ 回调查询 1（tg/queries：callback_query §5.2 官方样本逐字）+
 * 成员变更 2（tg/members：my_chat_member/chat_member 载荷样本未给，空对象
 * 占位、订阅语义由信封字段名承载）。全部 wire = json（HTTPS POST 明文
 * JSON Update，事件体不加密）。
 * 验证/握手同族：恒等头 X-Telegram-Bot-Api-Secret-Token = setWebhook
 * secret_token 原样回显（1–256 字符，A-Z a-z 0-9 _ -，字符串相等比较，
 * 无 HMAC）；官方无 challenge 握手（setWebhook 同步 True 即成功）——恒等头
 * 携带与探针由 Rust 适配器完成；应答成功判 2XY、非 2XY 按合理次数重推。
 */

export { TG_DEFINITIONS };

export const TG_SCHEMAS = [
  ...TG_MESSAGES_SCHEMAS,
  ...TG_QUERIES_SCHEMAS,
  ...TG_MEMBERS_SCHEMAS,
] as const;
