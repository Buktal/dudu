import { bilibiliTimestamp } from "@/lib/time";

import {
  BASE64_CHARS,
  hexChars,
  randomBytes,
  randomDigits,
  randomFromChars,
} from "./random";

/**
 * 海外/全域渠道的官方 ID 形态生成：WhatsApp/Telegram/B站。
 * 自 ids.ts 按渠道族拆分（单文件 ≤ 500 行，code-review 退件）。
 */

/**
 * WhatsApp 消息 ID wamid：官方样本 wamid.HBgL… 为前缀 + base64 风格串
 * （样本主体 48~51 字符、可带尾部 "="，事实库「ID 形态」速查）——三处同源
 * 幂等键，新建事件即新消息故重生成。
 */
export function generateWaWamid(): string {
  const length = 48 + (randomBytes(1)[0] % 4);
  return `wamid.HBgL${randomFromChars(BASE64_CHARS, length)}`;
}

/**
 * WhatsApp 电话 ID：官方样本 16505551234（wa_id/from/recipient_id）与
 * 15550783881（display_phone_number）为纯数字 E.164 无 + 前缀的 11 位数字串。
 */
export function generateWaPhone(): string {
  return randomDigits(11, 1);
}

/**
 * WhatsApp 账户/号码数字 ID：官方样本 WABA 102290129340398 与
 * phone_number_id 106540352242922 为 15 位数字串——首位取 1 保证恒在 2^53 内
 * （全程字符串，不经 number 防精度丢失）。
 */
export function generateWaAccountId(): string {
  return randomDigits(15, 1);
}

/** WhatsApp 会话 ID：官方样本为 32 位小写十六进制串（conversation.id） */
export function generateWaConversationId(): string {
  return hexChars(32);
}

/**
 * WhatsApp 模板 ID：官方样本 1689556908129832 为 16 位数字 JSON number——
 * 首位取 1 保证恒在 2^53 内（message_template_id 载荷形态即 number）。
 */
export function generateWaTemplateId(): number {
  return Number(randomDigits(16, 1));
}

/**
 * Telegram update_id：正整数 JSON number 顺序递增（官方样本 10000，api#update
 * ——「ignore repeated updates or restore the correct update sequence」的
 * 去重幂等键）；取 5 位数与官方样本同量级（首位非零）。
 */
export function generateTgUpdateId(): number {
  return Number(randomDigits(5));
}

/**
 * B站 openid：官方示例为 32 位字母数字混淆串（示例值混入 s/k/x/y 非 hex
 * 字符，事实库「ID 形态」速查）——按小写字母数字形态生成 32 位串。
 */
export function generateBiliOpenId(): string {
  return randomFromChars("0123456789abcdefghijklmnopqrstuvwxyz", 32);
}

/** B站 client_id：官方示例为 16 位小写十六进制串（即 x-bili-accesskeyid）。 */
export function generateBiliClientId(): string {
  return hexChars(16);
}

/**
 * B站 BV 号：官方示例 BV1S9L90H082 明显为占位——BV 号通行形态为 BV + 10 位
 * base58 字母数字（去易混 0、O、I、l），按该字符集生成。
 */
export function generateBiliBvId(): string {
  const body = randomFromChars(
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz",
    10,
  );
  return `BV${body}`;
}

/** B站事件 timestamp：yyyy-MM-dd HH:mm:ss（UTC+8 固定偏移，经 lib/time 封装）。 */
export function generateBiliTimestamp(): string {
  return bilibiliTimestamp();
}
