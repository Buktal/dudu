import approvalDefinitions from "../../definitions/dingtalk/dingtalk-approval.json";
import botMediaDefinitions from "../../definitions/dingtalk/dingtalk-bot-media.json";
import botMessagesDefinitions from "../../definitions/dingtalk/dingtalk-bot-messages.json";
import contactDefinitions from "../../definitions/dingtalk/dingtalk-contact.json";
import handshakeDefinitions from "../../definitions/dingtalk/dingtalk-handshake.json";
import {
  mergeChannelDefinitions,
  parseChannelDefinition,
} from "../../definitions/loader";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "../types";

/**
 * 钉钉渠道协议元数据公共体（事实库 docs/research/channels/dingtalk.md）：
 * 新 HTTP 密文信封子形态——平台 POST `{"encrypt":"<base64>"}` 到回调地址
 * （URL 参 signature/timestamp/nonce），解密后即各模板明文；sha1 四参验签
 * 与 AES（key=Base64Decode(EncodingAESKey+"=")、IV=key 前 16B、PKCS#7-32、
 * 包尾 $key）由 Rust 适配器完成，模板只持有解密后明文。机器人收消息
 * （6 msgtype）走明文通道 + HmacSHA256 头，同样由适配器完成验签要素。
 */

/** 版本化字段描述文件：按推送域分五份，装载即校验（坏文件启动即炸）后合并
 *  （机器人分 messages=text/picture/richText 与 media=语音/视频/文件——事实库
 *  §2.3：群 @ 不支持后三种媒体） */
export const DINGTALK_DEFINITIONS = mergeChannelDefinitions(
  [
    handshakeDefinitions,
    approvalDefinitions,
    contactDefinitions,
    botMessagesDefinitions,
    botMediaDefinitions,
  ].map((part) => parseChannelDefinition(part)),
);

/**
 * 加密信封事件的官方应答（事实库 §5.10/§3.2）：1500ms 内回 success 的加密包
 * `{"msg_signature","timeStamp","nonce","encrypt":enc("success")}`——期望按
 * dingtalkReply 形态声明（目标须回可验签解密的加密包且明文含 success）。
 */
export const DINGTALK_ENCRYPTED_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "success",
  bodyMode: "dingtalkReply",
};

/**
 * 机器人收消息的官方应答（事实库 §3.3）：官方未定义回包语义，仅校验
 * HTTP 200（正文不校验）。
 */
export const DINGTALK_BOT_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * 大写密文信封的 HTTP 明文形态（事实库 §5.2/§5.3/§5.4 逐字信封值）：
 * `{EventType, EventTime, CorpId, BizId, eventId}` + 业务字段平铺——
 * 与 Stream 双信封 `{eventType, …, data:{…}}` 相对，本渠道取 HTTP 子形态。
 */
export function dingtalkHttpEnvelope(
  eventType: string,
  fields: WirePayload,
): WirePayload {
  return {
    EventType: eventType,
    EventTime: 1663143335567,
    CorpId: "ding9f50b15bxxxx16741",
    BizId: "1663**35567",
    eventId: "c7c7120f2c07419**ebdba0318c8",
    ...fields,
  };
}

/** HTTP 信封的 ID 生成规则：eventId（32 位 hex）+ EventTime（毫秒数） */
export function dingtalkEnvelopeIdGenerations(): IdGeneration[] {
  return [
    { path: "eventId", kind: "hexId32" },
    { path: "EventTime", kind: "createTimeMs" },
  ];
}
