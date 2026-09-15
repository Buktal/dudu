import { weiboCreatedAt } from "@/lib/time";

import {
  BASE64_CHARS,
  hexChars,
  randomBytes,
  randomDigits,
  randomFromChars,
} from "./random";

/**
 * 平台/IM 系渠道的官方 ID 形态生成：抖音/企微/飞书/钉钉/QQ/微博/小红书/快手。
 * 自 ids.ts 按渠道族拆分（单文件 ≤ 500 行，code-review 退件）。
 */

export function generateOpenId(): string {
  return crypto.randomUUID();
}

export function generateEncryptedId(): string {
  const body = randomFromChars(BASE64_CHARS, 86);
  return `@${body}==`;
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

export function generateLogId(): string {
  const now = new Date();
  const prefix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const bytes = randomBytes(9);
  return (
    prefix +
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function generateCreateTimeMs(): number {
  return Date.now();
}

/** 企微 CreateTime：10 位 Unix 秒级时间戳（字符串形态，XML 裸文本输出） */
export function generateCreateTimeSec(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** 10 位 Unix 秒级时间戳（数字形态：小游戏 CreateTime、digg action_time） */
export function generateCreateTimeSecNumber(): number {
  return Math.floor(Date.now() / 1000);
}

/** 企微 MsgId：18 位数字串（首位非零，恒 < 2^63-1） */
export function generateMsgId64(): string {
  return randomDigits(18);
}

/** 企微智能机器人 msgid：base64 风格串（官方样本 31 字符 + "="，可含 + /） */
export function generateAibotMsgId(): string {
  return `${randomFromChars(BASE64_CHARS, 31)}=`;
}

/** 飞书 event_id：32 位小写十六进制串（官方样本形态） */
export function generateHexId32(): string {
  return hexChars(32);
}

/** 飞书 create_time：13 位毫秒时间戳（字符串形态，JSON 内带引号） */
export function generateCreateTimeMsString(): string {
  return String(Date.now());
}

/** 飞书 open_id：ou_ + 32 位十六进制（官方样本 ou_84aad35d084aa403a838cf73ee18467） */
export function generateLarkOpenId(): string {
  return `ou_${hexChars(32)}`;
}

/** 飞书 union_id：on_ + 32 位十六进制（官方样本 on_8ed6aa67826108097d9ee143816345） */
export function generateLarkUnionId(): string {
  return `on_${hexChars(32)}`;
}

/** 飞书 message_id：om_ + 32 位十六进制（幂等键，官方样本 om_dc132645…） */
export function generateLarkMessageId(): string {
  return `om_${hexChars(32)}`;
}

/** 飞书 chat_id：oc_ + 32 位十六进制（单聊/群共用，官方样本 oc_5ad11d72…） */
export function generateLarkChatId(): string {
  return `oc_${hexChars(32)}`;
}

/**
 * 钉钉机器人 msgId：24 字符 base64 风格 + "=="（幂等键，官方样本
 * msgrK2ckHkMbaiUWt5xQU+riw== 的形态；16 字节消息标识的 base64 即此长度）
 */
export function generateDingtalkMsgId(): string {
  return `${randomFromChars(BASE64_CHARS, 24)}==`;
}

const ALPHANUMERIC_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * QQ 消息 id：ROBOT1.0_ 前缀 + 56 位字母数字（官方黄金样本掩码占位为
 * 56 个 x，事实库「对 MockPulse 模拟的直接含义」ID 形态速查）
 */
export function generateQqRobotMsgId(): string {
  return `ROBOT1.0_${randomFromChars(ALPHANUMERIC_CHARS, 56)}`;
}

/** QQ openid：32 位大写十六进制（user_openid/group_openid/member_openid 形态） */
export function generateQqOpenId(): string {
  return randomFromChars("0123456789ABCDEF", 32);
}

/**
 * 微博 receiver_id/sender_id：int64 数字 UID（官方样本 1902538057/2489518277
 * 为 10 位数；数字形态直落 JSON，10 位 < 2^53 无精度问题）
 */
export function generateWeiboUid(): number {
  return Number(randomDigits(10));
}

/** 微博 created_at：线上字符串形态（格式经 lib/time 封装单点） */
export function generateWeiboCreatedAt(): string {
  return weiboCreatedAt();
}

/**
 * 小红书 MsgId：官方仅口径为字符串（事实库 §10.3），无格式样本——按微信系
 * int64 MsgId 同族的 18 位数字串生成（全程字符串，不经 number 防精度丢失）
 */
export function generateXhsMsgId(): string {
  return randomDigits(18);
}

/**
 * 快手 message_id：官方支付回调样本为小写 UUID 形态（事实库 §4.1 样本
 * 76a50e0c-a843-492b-…；「每次随机生成的 ID」，重试保持一致——幂等键随新事件变化）
 */
export function generateKsMessageId(): string {
  return crypto.randomUUID();
}
