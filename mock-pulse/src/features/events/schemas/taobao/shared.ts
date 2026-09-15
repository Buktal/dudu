import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import globalDefinitions from "../../definitions/taobao/taobao-global.json";
import openimDefinitions from "../../definitions/taobao/taobao-openim.json";
import tradeDefinitions from "../../definitions/taobao/taobao-trade.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 淘宝渠道协议元数据公共体（事实库 docs/research/channels/taobao.md，
 * 全球栈 HTTPS 回调子形态——国内 TOP 无 HTTP 回调，TMC 长连接不在范围）：
 * - 传输（§3.2/§4.2/§4.3）：POST 明文 JSON（数据明文传输，无 AES 解密层），
 *   头 Authorization = HEX(HMAC-SHA256(AppKey + body, AppSecret)) 小写 hex；
 *   应答 HTTP 200 即确认签收（正文无语义），超 500ms 未收到 200 视为失败，
 *   半小时后重试、最多 12 次——验签/Verify 握手由 Rust 适配器完成
 * - 模板四源（全部官方样本逐字）：交易/退款代表事件取 TOP topic 核验载荷页
 *   （§5.3 TradeCreate / §5.4 RefundCreated），全球栈 HTTP 回调取接收消息页
 *   正向/逆向示例（§5.6），OpenIM 离线消息取旺旺聊天 envelope 形态参考
 *   （§5.8；OffMsgPush 载荷全文待核验(09-27)）
 * 字段说明与版本/来源由 definitions/taobao/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按域分三份，装载即校验（坏文件启动即炸）后合并 */
export const TB_DEFINITIONS = mergeChannelDefinitions(
  [tradeDefinitions, globalDefinitions, openimDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
);

/**
 * 官方成功语义（§3.2 逐字）：「收到消息后请返回 HTTP 200 状态码，确认签收
 * 消息」——应答无正文口径（Verify 验证同样只看 HTTP 200），空串 = 只看状态码。
 */
export const TB_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * 全球栈回调信封骨架（§5.6 官方键序：seller_id/message_type/data/timestamp/
 * site），data 与其余字段由调用方覆写；样本值取官方原文（site 为全球栈/
 * Lazada 同栈文档原文 lazada_vn）。
 */
export function tbGlobalEnvelope(
  sellerId: string,
  data: WirePayload,
  timestamp: number,
): WirePayload {
  return {
    seller_id: sellerId,
    message_type: 0,
    data,
    timestamp,
    site: "lazada_vn",
  };
}

/**
 * 旺旺聊天文本 envelope 骨架（§5.8 官方键序：content/to_id/nickname/from_id/
 * gmt_send/msg_id，仅形态参考——OffMsgPush 载荷全文待核验(09-27)）。
 */
export function tbOpenimEnvelope(content: string): WirePayload {
  return {
    content,
    to_id: "it3d3hxlxiaomishu",
    nickname: "it3d3hxltest0",
    from_id: "it3d3hxltest0",
    gmt_send: "1444297001",
    msg_id: "6269105334747922432",
  };
}

/**
 * OpenIM envelope 的 ID 生成规则（§5.8 样本形态）：gmt_send 为 10 位秒级
 * 时间戳字符串、msg_id 为 19 位数字串（int64 形态，幂等键随新事件变化）。
 */
export function tbOpenimIdGenerations(): IdGeneration[] {
  return [
    { path: "gmt_send", kind: "createTimeSec" },
    { path: "msg_id", kind: "openimMsgId" },
  ];
}

/**
 * 全球栈信封的 ID 生成规则（§5.6 样本形态）：timestamp 为 13 位毫秒时间戳、
 * data.status_update_time 为 10 位秒级时间戳（数字形态）。
 */
export function tbGlobalIdGenerations(): IdGeneration[] {
  return [
    { path: "timestamp", kind: "createTimeMs" },
    { path: "data.status_update_time", kind: "createTimeSecNumber" },
  ];
}
