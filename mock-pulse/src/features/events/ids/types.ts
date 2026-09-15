/**
 * 生成器统一签名：产出字符串或数字形态的官方 ID（字符串形态用于超 2^53
 * 的 int64 口径，防精度丢失）。
 */
export type Generator = () => string | number;
