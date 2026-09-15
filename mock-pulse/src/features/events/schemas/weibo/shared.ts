import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import weiboEventDefinitions from "../../definitions/weibo/weibo-events.json";
import weiboMessageDefinitions from "../../definitions/weibo/weibo-messages.json";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 微博渠道协议元数据公共体（事实库 docs/research/channels/weibo.md，
 * 粉丝服务平台 Webhook，JSON 默认格式）：
 * 载荷骨架 type/receiver_id/sender_id/created_at/text/data 逐字取自官方样本
 * （receiver_id/sender_id 为 int64 数字 UID，created_at 为
 * `Mon Jul 16 18:09:20 +0800 2012` 字符串）；私信 type 直接判型，事件
 * type:"event" + data.subtype 判型（mention 已暂停不收，事实库 §2.2）。
 * 排重键 sender_id + created_at（官方无消息 ID）；GET 四参握手与三参 sha1
 * 验签由 Rust 适配器完成（黄金算例 xyz123xyz → 90e4c22c…）。
 * 字段说明与版本/来源由 definitions/weibo/ 分域描述文件装载即校验后合并。
 */

/** 版本化字段描述文件：按推送域分两份，装载即校验（坏文件启动即炸）后合并 */
export const WB_DEFINITIONS = mergeChannelDefinitions(
  [weiboMessageDefinitions, weiboEventDefinitions].map((part) =>
    parseChannelDefinition(part),
  ),
);

/**
 * 微博官方成功语义（事实库 §3.3）：5 秒内应答即成功（超时断开×3 重试）；
 * 回空串 = 官方明示「微博服务器不会对此作任何处理，并且不会发起重试」——
 * 正常回执无正文口径，只看 HTTP 200（被动回复/空串均合法，可在编辑器改期望）。
 */
export const WB_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * 载荷骨架（事实库 §5 官方样本逐字键序：type/receiver_id/sender_id/
 * created_at/text/data）：身份取官方样本 UID 对（1902538057/2489518277），
 * 时刻取官方样本字符串；data 段由调用方覆写。
 */
export function wbEnvelope(
  type: string,
  text: string,
  data: WirePayload,
): WirePayload {
  return {
    type,
    receiver_id: 1902538057,
    sender_id: 2489518277,
    created_at: "Mon Jul 16 18:09:20 +0800 2012",
    text,
    data,
  };
}

/**
 * 骨架的 ID 生成规则（排重键 sender_id + created_at 半边全部重生成）：
 * UID 为 int64 数字形态（10 位，官方样本形态）、时刻为线上字符串格式。
 */
export function wbIdGenerations(): IdGeneration[] {
  return [
    { path: "receiver_id", kind: "weiboUid" },
    { path: "sender_id", kind: "weiboUid" },
    { path: "created_at", kind: "weiboCreatedAt" },
  ];
}
