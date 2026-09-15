import { taobaoModified } from "@/lib/time";

import { hexChars, randomBytes, randomDigits } from "./random";

/**
 * 电商/交易系渠道的官方 ID 形态生成：淘宝（含 OpenIM）/京东/拼多多/美团/
 * 饿了么/支付宝。自 ids.ts 按渠道族拆分（单文件 ≤ 500 行，code-review 退件）。
 */

/**
 * 淘宝业务单号（tid/oid/refund_id）：官方样本为数字串形态（TradeCreate 的
 * tid "123456789"、RefundCreated 的 oid "110770592823138"），JSON 里恒为
 * 字符串——取 9~15 位数字串（首位非零）。
 */
export function generateTaobaoBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/** 淘宝退款 modified：线上字符串形态（格式经 lib/time 封装单点） */
export function generateTaobaoModified(): string {
  return taobaoModified();
}

/**
 * OpenIM msg_id：19 位数字串（官方样本 6269105334747922432 为 int64 形态，
 * 首位取 1~6 保证恒小于 2^63-1）
 */
export function generateOpenimMsgId(): string {
  return randomDigits(19, { min: 1, max: 6 });
}

/**
 * 京东业务单号（订单号/服务单号）：官方未给格式样本（事实库仅「京东订单号」
 * 「服务单号」词汇实锤），按京东单号数字串同族形态取 9~15 位数字串（首位非零）。
 */
export function generateJdBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/**
 * 拼多多订单号：官方未给格式样本（事实库仅「轻量变更通知含订单号」口径），
 * 按电商单号数字串同族形态取 9~15 位数字串（首位非零）。
 */
export function generatePddBizId(): string {
  return randomDigits(9 + (randomBytes(1)[0] % 7));
}

/**
 * 美团订单号：官方样本 27061900338318741 为 17 位数字串（docDetail/177/180
 * 核验样本，bigint(20) 存储）——取 15~17 位数字串（首位非零，17 位仍在
 * int64 内）；订单三态推送 order_id 与 wm_order_id_view（sameAs）共用。
 */
export function generateMtBizId(): string {
  return randomDigits(15 + (randomBytes(1)[0] % 3));
}

/**
 * 饿了么订单号 eleme_order_id：官方样本 12637645858619059（17 位）与
 * 100025663239521904（18 位）为纯数字字符串（事实库 §5.2/§5.4 核验样本）——
 * 取 17~18 位数字串，首位取 1 保证恒小于 2^63-1；全程字符串不经 number
 * 防精度丢失；订单状态/配送/退单/赔偿四推送共用。
 */
export function generateEleBizId(): string {
  return randomDigits(17 + (randomBytes(1)[0] % 2), 1);
}

/**
 * 支付宝通知校验 ID notify_id：官方样本 ac05099524730693a8b330c45cf72da943
 * 为 35 位小写十六进制串（事实库 §5.1 公共参数表逐字，「通知校验 ID」128 位
 * 口径）——同条异步通知重试时 notify_id 不变（§3.4 逐字），幂等键首选；
 * 新建事件即新通知故重生成，三地址代表模板共用。
 */
export function generateAliNotifyId(): string {
  return hexChars(35);
}
