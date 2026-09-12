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

/** 企微 MsgId：18 位数字串（首位非零，恒 < 2^63-1） */
export function generateMsgId64(): string {
  const bytes = randomBytes(18);
  let out = String((bytes[0] % 9) + 1);
  for (let i = 1; i < 18; i += 1) {
    out += String(bytes[i] % 10);
  }
  return out;
}

type Generator = () => string | number;

const GENERATORS: Record<IdKind, Generator> = {
  openId: generateOpenId,
  encryptedId: generateEncryptedId,
  logId: generateLogId,
  createTimeMs: generateCreateTimeMs,
  createTimeSec: generateCreateTimeSec,
  msgId64: generateMsgId64,
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
