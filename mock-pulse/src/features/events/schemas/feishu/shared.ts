import feishuEventDefinitions from "../../definitions/feishu/feishu-events.json";
import feishuImDefinitions from "../../definitions/feishu/feishu-im.json";
import feishuVerificationDefinitions from "../../definitions/feishu/feishu-verification.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 飞书渠道协议元数据公共体（事实库 docs/research/channels/feishu.md）：
 * Webhook 子形态 JSON v2.0 信封（schema + header + event），载荷逐字取自
 * 官方核验样本；字段说明与版本/来源由 definitions/feishu/ 分域描述文件
 * 装载即校验后合并。POST challenge 握手、X-Lark-Signature 验签与
 * AES-256-CBC 加密信封（key = sha256(encrypt_key)、IV 前 16B）由 Rust
 * 适配器完成，模板只持有明文。
 */

/** 版本化字段描述文件：按域分三份，装载即校验（坏文件启动即炸）后合并 */
export const FEISHU_DEFINITIONS = mergeChannelDefinitions(
  [
    feishuVerificationDefinitions,
    feishuImDefinitions,
    feishuEventDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 事件官方成功语义（事实库 §3.3）：3 秒内 HTTP 200 即成功，正文不校验
 * （至少一次投递 + 15s/5m/1h/6h×4 重试，由目标侧幂等消化）。
 */
export const FEISHU_EVENT_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * url_verification 官方应答（事实库 §3.2）：1 秒内原样回显 challenge，
 * 即 `{"challenge":"<请求值>"}`。期望默认按 JSON 字段子集匹配（challenge
 * 与黄金载荷同值）；改动载荷 challenge 时应同步期望。
 */
export const FEISHU_VERIFICATION_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: '{"challenge":"ajls384kdjxxxx"}',
  bodyMode: "jsonField",
};

/** 官方黄金样本公共 header（事实库 §5.4–§5.7/§5.9 逐字；仅 event_type 随事件变） */
export function feishuEnvelope(
  eventType: string,
  event: WirePayload,
): WirePayload {
  return {
    schema: "2.0",
    header: {
      event_id: "5e3702a84e847582be8db7fb73283c02",
      event_type: eventType,
      create_time: "1608725989000",
      token: "rvaYgkND1GOiu5MM0E1rncYC6PLtF7JV",
      app_id: "cli_9f5343c580712544",
      tenant_key: "2ca1d211f64f6438",
    },
    event,
  };
}

/** 信封 header 的 ID 生成规则：event_id（32 位 hex）+ create_time（毫秒字符串） */
export function feishuHeaderIdGenerations(): IdGeneration[] {
  return [
    { path: "header.event_id", kind: "hexId32" },
    { path: "header.create_time", kind: "createTimeMsString" },
  ];
}
