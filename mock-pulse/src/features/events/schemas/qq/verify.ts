import { defineSchema } from "../define";
import type { IdGeneration, WirePayload } from "../types";
import { QQ_DEFINITIONS, QQ_VERIFY_EXPECTED } from "./shared";

/**
 * QQ op13 验证回调（事实库 §3.2/§5.2 逐字）：首次配置 Webhook 回调地址时
 * 平台推送 `{"d":{"plain_token":…,"event_ts":…},"op":13}`（请求头
 * `User-Agent: QQBot-Callback` + `X-Bot-Appid`），开发者服务须回
 * `{"plain_token":"<同值>","signature":"hex(Ed25519.Sign(priv, event_ts +
 * plain_token))"}`（priv 由 Bot Secret 翻倍截断 32 字节派生）。本模板即
 * 平台请求的逐字形态；回包验签在 Rust 适配器（期望 QQ_VERIFY_EXPECTED）。
 */

/** 官方黄金样本 §3.2：op13 验证回调请求体（d 在前、op 在后，逐字键序） */
const GOLDEN_OP13_VERIFY: WirePayload = {
  d: {
    plain_token: "Arq0D5A61EgUu4OxUvOp",
    event_ts: "1725442341",
  },
  op: 13,
};

/** op13 验证回调的 ID 生成规则：event_ts 按当前秒刷新（签名对新值仍然自洽） */
function verifyIdGenerations(): IdGeneration[] {
  return [{ path: "d.event_ts", kind: "createTimeSec" }];
}

export const QQ_VERIFY_SCHEMAS = [
  defineSchema(QQ_DEFINITIONS, "qq-op13-verify", {
    // op13 载荷无 t（事件名字段），eventName 取官方操作码事实「op13」
    eventName: "op13",
    name: "Webhook 验证回调（op13）",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: QQ_VERIFY_EXPECTED,
    idGenerations: verifyIdGenerations(),
    payload: GOLDEN_OP13_VERIFY,
  }),
] as const;
