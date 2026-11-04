import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { XHS_DEFINITIONS, XHS_THIRD_EXPECTED } from "./shared";

/**
 * 小红书三方私信线索推送（事实见 docs/research/channels/
 * xiaohongshu-third-im-spec.md，[多源]+[联调代码] 级证据）：聚光后台
 * 「私信 API 对接」配置回调后平台 POST 线索报文，信封 {data,timestamp,source}
 * （§1.4 联调代码信封逐字），data 为线索字段表（SnakeCase）+ 线索标签键值对
 * 数组。传输为明文 JSON + header X-Red-Signature 验签（§1.2：sha1=HMAC-SHA1
 * (token,原始 body)，官方验签可选）——签名头由 Rust 适配器按连接 pushToken
 * 构造；应答唯一要求 HTTP 200（§1.3，失败 30s×3 重试）。消息级推送信封未公开
 * （§1.5），本面仅线索模板。样本值：timestamp 信封样本 1721796000000 逐字
 * （GMT+8 2024-07-24 10:00，与 submitted_time 自洽），字段值官方无样本按事实库
 * 掩码/占位风格构造。
 */

/** 线索推送信封（§1.4 键序逐字：data/timestamp/source） */
const GOLDEN_LEAD: WirePayload = {
  data: {
    landing_page_id: 881,
    url: "https://www.xiaohongshu.com/note/01****",
    submitted_time: "2024-07-24 10:00:00",
    source_channel: "search",
    account_id: "ACCOUNT_ID",
    account_name: "MERCHANT_ACCOUNT_NAME",
    campaign_id: 201,
    campaign_name: "CAMPAIGN_NAME",
    unit_id: 301,
    unit_name: "UNIT_NAME",
    creative_id: 401,
    leads_id: "LEADS_ID",
    keyword: "KEYWORD",
    data: [
      { label: "电话号码", value: "138****0000" },
      { label: "用户昵称", value: "USER_NICK_NAME" },
    ],
  },
  timestamp: 1721796000000,
  source: "xx",
};

export const XHS_THIRD_SCHEMAS = [
  defineSchema(XHS_DEFINITIONS, "xhs-third-lead", {
    eventName: "lead",
    name: "线索推送",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: XHS_THIRD_EXPECTED,
    idGenerations: [{ path: "data.leads_id", kind: "xhsLeadsId" }],
    payload: GOLDEN_LEAD,
  }),
] as const;
