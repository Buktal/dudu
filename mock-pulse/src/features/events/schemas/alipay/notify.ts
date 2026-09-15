import { defineSchema } from "../define";
import type { EventSchema } from "../types";
import { ALI_DEFINITIONS, ALI_EXPECTED } from "./shared";

/**
 * 支付异步通知（事实库 §5.1 公共参数表 + 业务参数表逐字，接口级 notify_url
 * 代表事件）：notify_type=trade_status_sync（§5.1 示例值逐字，交易状态同步），
 * POST 表单（wire = form，§2.1「POST 请求的形式将支付结果作为参数通知」，
 * request.Form/$_POST 取参）到商户调用支付请求时传入的 notify_url。字段族 =
 * §5.1 两表逐字（notify_time/notify_type/notify_id/charset/version/sign_type/
 * sign/auth_app_id + trade_no/app_id/out_trade_no/trade_status）+ total_amount
 * （§3.4 验签后必做核对实锤字段，值占位注明）。支付认定口径（§2.1 逐字）：仅
 * TRADE_SUCCESS/TRADE_FINISHED 认买家付款成功，支付成功不含 out_biz_no——故
 * 载荷无 out_biz_no/gmt_refund/refund_fee（退款通知字段）。sign 为官方页样例
 * 截断示意值照录，直发时适配器剔除现算（事实库警示不作验签回归向量）。
 */

export const ALI_NOTIFY_SCHEMAS: readonly EventSchema[] = [
  defineSchema(ALI_DEFINITIONS, "ali-notify-trade-status-sync", {
    eventName: "trade_status_sync",
    name: "支付异步通知·交易状态同步（trade_status_sync）",
    kind: "event",
    contentString: false,
    wire: "form",
    expected: ALI_EXPECTED,
    // notify_id 幂等键（§3.4：同条通知重试不变）——新建事件即新通知按官方
    // 样本形态（35 位小写十六进制）重生成；trade_no/out_trade_no 取官方样本
    // 值不重生成（样本即黄金值，格式口径仅单样本不立生成规则）
    idGenerations: [{ path: "notify_id", kind: "aliNotifyId" }],
    payload: {
      notify_time: "2018-10-21 15:45:22",
      notify_type: "trade_status_sync",
      notify_id: "ac05099524730693a8b330c45cf72da943",
      charset: "utf-8",
      version: "1.0",
      sign_type: "RSA2",
      sign: "601510b7970e52cc63db0f44997cf70e",
      auth_app_id: "2018072300007418",
      trade_no: "2013112011001004330000121536",
      app_id: "2019082200007148",
      out_trade_no: "6823789339978248",
      trade_status: "TRADE_SUCCESS",
      total_amount: "10.99",
    },
  }),
];
