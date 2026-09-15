import { parseChannelDefinition } from "../../definitions/loader";
import orderDefinitions from "../../definitions/pinduoduo/pinduoduo-order.json";
import type { ExpectedReceipt } from "../types";

/**
 * 拼多多渠道协议元数据公共体（事实库 docs/research/channels/pinduoduo.md）：
 * - 传输（事实库附「对 MockPulse 模拟的直接含义」网关模拟口径 + §4.1 公共参数
 *   表）：POST JSON body（Content-Type: application/json，网关
 *   gw-api.pinduoduo.com/api/router 的调用形态）；签名 = UPPER(MD5(client_secret
 *   + ASCII 排序 k+v 拼接 + client_secret))（§4.1 官方三步逐字，官方向量
 *   E4DE3ED21002510DED352819E7AE6775 已核验）；公共参数 client_id/timestamp
 *   （UNIX 秒）必传，access_token 放参数集参签（非 Authorization 头）。签名与
 *   探针握手由 Rust 适配器完成
 * - 待核验(09-27)口径：推送传输形态（回调 URL 配置、challenge 握手、头字段）、
 *   消息 topic 目录、重试幂等均未取得官方原文（§3/§7）——适配器以「探针 +
 *   唯一实锤的 §4.1 签名规则」模拟（同京东先例），不编造信封；模板载荷只收
 *   官方已实锤字段（推送载荷正文属 SPA 待复核范畴）
 * - 模板四源（官方实锤逐字）：订单三态推送（pinduoduo/order：§2.1 订单状态
 *   照录 1-待发货 / 2-已发货代签收 / 3-已签收 + §5.1 order_status 参数词汇）
 * 字段说明与版本/来源由 definitions/pinduoduo/ 描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：装载即校验（坏文件启动即炸） */
export const PDD_DEFINITIONS = parseChannelDefinition(orderDefinitions);

/**
 * 官方成功语义（事实库现状）：推送应答与签收口径待核验(09-27)（§3 未取得
 * 官方原文）——模板期望回执取最中性签收语义 HTTP 200 + 不校验正文，
 * 09-27 复核后收口。
 */
export const PDD_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};
