/**
 * 随机 ID 生成的基础件：字节源、数字串（首位约束保证 int64/2^53 上限语义）、
 * 字符集均匀采样。自 ids.ts 抽出（code-review 退件：「首位非零数字串」循环
 * 与字符集采样原先 ~9 处逐字重复，收敛为 randomDigits / randomFromChars）。
 */

/** 密码学安全随机字节源 */
export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * [0, span) 均匀随机整数：拒绝采样消模偏差——256 % span ≠ 0 时直接取模
 * 会让前 256 % span 个值多出现一次，只接受 [0, 256 - 256 % span) 内的
 * 字节，其余重抽（span 整除 256 时零拒绝）。
 */
function uniformBelow(span: number): number {
  const limit = 256 - (256 % span);
  let byte = randomBytes(1)[0];
  while (byte >= limit) {
    byte = randomBytes(1)[0];
  }
  return byte % span;
}

/**
 * 生成 length 位数字串（全程字符串不经 number，防 2^53 精度丢失）。
 * 首位约束决定数值上限语义：{min,max} 区间取样（如 {min:1,max:6} 保证
 * 恒小于 2^63-1）或固定首位（如 1，保证恒在 2^53 内）；缺省 1~9 非零。
 */
export function randomDigits(
  length: number,
  firstDigit: number | { min: number; max: number } = { min: 1, max: 9 },
): string {
  const head =
    typeof firstDigit === "number"
      ? String(firstDigit)
      : String(
          uniformBelow(firstDigit.max - firstDigit.min + 1) + firstDigit.min,
        );
  let digits = head;
  for (let i = 1; i < length; i += 1) {
    digits += String(uniformBelow(10));
  }
  return digits;
}

/** 从字符集均匀采样 length 位（拒绝采样，消 byte % length 的模偏差） */
export function randomFromChars(charset: string, length: number): string {
  let sampled = "";
  for (let i = 0; i < length; i += 1) {
    sampled += charset[uniformBelow(charset.length)];
  }
  return sampled;
}

const HEX_CHARS = "0123456789abcdef";

/** n 位小写十六进制串（飞书 event_id、支付宝 notify_id 等形态） */
export function hexChars(length: number): string {
  return randomFromChars(HEX_CHARS, length);
}

/** base64 字符集（加密串/msgid 形态；官方样本可含 + /） */
export const BASE64_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
