import { weiboCreatedAt } from "@/lib/time";

import {
  cloneJson,
  getAt,
  parseContentString,
  setAt,
  stringifyContentString,
} from "./payload";
import type { EventSchema, IdKind } from "./schemas";

/**
 * 新建事件的默认 ID 按官方形态生成（研究文档「对 MockPulse 模拟的直接含义」）：
 * - open_id：uuid v4 风格
 * - 会话/消息 ID：`@` 开头 base64 风格加密串
 * - log_id：32 位十六进制串（日期时间前缀 + hex 后缀，官方样本形态）
 * - create_time：13 位毫秒时间戳（抖音）
 * - createTimeSec：10 位秒级时间戳（企微；字符串形态）
 * - msgId64：64 位整型消息 ID（企微 MsgId；18 位数字串，恒在 int64 内，
 *   全程字符串不经 number，防 2^53 精度丢失）
 * - aibotMsgId：企微智能机器人 msgid（官方样本 31 字符 base64 风格 + "="）
 * - hexId32：32 位小写十六进制（飞书 event_id）
 * - createTimeMsString：13 位毫秒时间戳字符串（飞书 create_time 字符串形态）
 * - larkOpenId/larkUnionId/larkMessageId/larkChatId：飞书 ou_/on_/om_/oc_ 前缀
 *   + 32 位十六进制（事实库「对 MockPulse 模拟的直接含义」ID 形态速查）
 * - dingtalkMsgId：钉钉机器人 msgId（msgr…== base64 形态，官方样本 msgrK2ck…）
 * - qqRobotMsgId：QQ 消息 id（ROBOT1.0_ + 56 位字母数字，官方样本掩码长度）
 * - qqOpenId：QQ openid（32 位大写十六进制）
 * - weiboUid：微博 receiver_id/sender_id（int64 数字 UID，官方样本 1902538057
 *   形态的 10 位数）
 * - weiboCreatedAt：微博 created_at（Mon Jul 16 18:09:20 +0800 2012 字符串，
 *   排重键 sender_id+created_at 的时刻半边，经 lib/time 封装格式化）
 */

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function generateOpenId(): string {
  return crypto.randomUUID();
}

const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function generateEncryptedId(): string {
  const bytes = randomBytes(86);
  const body = Array.from(bytes, (byte) => BASE64_CHARS[byte % 64]).join("");
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
  const bytes = randomBytes(18);
  let out = String((bytes[0] % 9) + 1);
  for (let i = 1; i < 18; i += 1) {
    out += String(bytes[i] % 10);
  }
  return out;
}

/** 企微智能机器人 msgid：base64 风格串（官方样本 31 字符 + "="，可含 + /） */
export function generateAibotMsgId(): string {
  const bytes = randomBytes(31);
  const body = Array.from(
    bytes,
    (byte) => BASE64_CHARS[byte % BASE64_CHARS.length],
  ).join("");
  return `${body}=`;
}

const HEX_CHARS = "0123456789abcdef";

function hexChars(length: number): string {
  return Array.from(randomBytes(length), (byte) => HEX_CHARS[byte % 16]).join(
    "",
  );
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
  const body = Array.from(
    randomBytes(24),
    (byte) => BASE64_CHARS[byte % BASE64_CHARS.length],
  ).join("");
  return `${body}==`;
}

const ALPHANUMERIC_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/**
 * QQ 消息 id：ROBOT1.0_ 前缀 + 56 位字母数字（官方黄金样本掩码占位为
 * 56 个 x，事实库「对 MockPulse 模拟的直接含义」ID 形态速查）
 */
export function generateQqRobotMsgId(): string {
  const body = Array.from(
    randomBytes(56),
    (byte) => ALPHANUMERIC_CHARS[byte % ALPHANUMERIC_CHARS.length],
  ).join("");
  return `ROBOT1.0_${body}`;
}

/** QQ openid：32 位大写十六进制（user_openid/group_openid/member_openid 形态） */
export function generateQqOpenId(): string {
  const chars = "0123456789ABCDEF";
  return Array.from(randomBytes(32), (byte) => chars[byte % 16]).join("");
}

/**
 * 微博 receiver_id/sender_id：int64 数字 UID（官方样本 1902538057/2489518277
 * 为 10 位数；数字形态直落 JSON，10 位 < 2^53 无精度问题）
 */
export function generateWeiboUid(): number {
  const bytes = randomBytes(10);
  let digits = String((bytes[0] % 9) + 1);
  for (let i = 1; i < 10; i += 1) {
    digits += String(bytes[i] % 10);
  }
  return Number(digits);
}

/** 微博 created_at：线上字符串形态（格式经 lib/time 封装单点） */
export function generateWeiboCreatedAt(): string {
  return weiboCreatedAt();
}

type Generator = () => string | number;

const GENERATORS: Record<IdKind, Generator> = {
  openId: generateOpenId,
  encryptedId: generateEncryptedId,
  logId: generateLogId,
  createTimeMs: generateCreateTimeMs,
  createTimeSec: generateCreateTimeSec,
  createTimeSecNumber: generateCreateTimeSecNumber,
  msgId64: generateMsgId64,
  aibotMsgId: generateAibotMsgId,
  hexId32: generateHexId32,
  createTimeMsString: generateCreateTimeMsString,
  larkOpenId: generateLarkOpenId,
  larkUnionId: generateLarkUnionId,
  larkMessageId: generateLarkMessageId,
  larkChatId: generateLarkChatId,
  dingtalkMsgId: generateDingtalkMsgId,
  qqRobotMsgId: generateQqRobotMsgId,
  qqOpenId: generateQqOpenId,
  weiboUid: generateWeiboUid,
  weiboCreatedAt: generateWeiboCreatedAt,
};

/**
 * 按 schema 的 idGenerations 声明替换载荷中的 ID 字段（返回新对象）：
 * - 仅对模板载荷中已存在的路径生效——路径不存在则跳过，不凭空创建
 *   （黄金样本里没有的字段不能在新建草稿时混入）
 * - sameAs 规则共用同一生成值（如资料 open_id 跟随发送者）
 * - contentString 模板会解析 content 替换后再序列化回字符串
 */
export function applyGeneratedIds(
  schema: EventSchema,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const draft: Record<string, unknown> = cloneJson(payload);
  // contentString 转换只在载荷确有 content 键时进行（XML 模板无 content，
  // 不能凭空造出 undefined 键污染脏检查）
  if ("content" in draft) {
    draft.content = parseContentString(schema, draft.content);
  }

  const shared = new Map<string, string | number>();
  for (const rule of schema.idGenerations) {
    if (getAt(draft, rule.path) === undefined) {
      continue;
    }
    let value = rule.sameAs ? shared.get(rule.sameAs) : undefined;
    if (value === undefined) {
      value = GENERATORS[rule.kind]();
    }
    shared.set(rule.path, value);
    setAt(draft, rule.path, value);
  }

  if ("content" in draft) {
    draft.content = stringifyContentString(schema, draft.content);
  }
  return draft;
}
