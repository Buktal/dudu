import eventsDefinitions from "../../definitions/bilibili/bilibili-events.json";
import { parseChannelDefinition } from "../../definitions/loader";
import type { ExpectedReceipt, WirePayload } from "../types";

/**
 * B站渠道协议元数据公共体（事实库 docs/research/channels/bilibili.md，
 * 开放平台 Webhooks）：
 * - 传输（§2）：HTTPS POST 明文 JSON（§4.3 无加密记载——镜像页无加密信封
 *   描述、官方事件页示例均为明文，AES/RSA 解密不适用）
 * - 包络（§2.2 官方公共参数表逐字）：{event: string 事件名, content: Struct
 *   具体消息结构体, timestamp: string "yyyy-MM-dd HH:mm:ss"（UTC+8）}——
 *   官方无 message_id/event_id 字段，消费方以业务键去重（§3.3 实现建议）
 * - 签名（§4.2 官方摘录头表 + Rust 适配器）：x-bili-accesskeyid(=client_id)/
 *   x-bili-content-md5(全小写)/x-bili-signature-method(HMAC-SHA256)/
 *   x-bili-signature-nonce/x-bili-signature-version(2.0)/x-bili-timestamp
 *   (unix 秒) + Authorization = HMAC-SHA256 签名；拼接串官方正文未取（社区
 *   DotnetDemo 自述「头字典序排序 + \n 连接 + app_secret 做 HMAC-SHA256」
 *   → 待核验(09-27)）；镜像口径的回调 SHA1 + x-bilibili-signature 拼接法
 *   官方无印证、不可直接实现（§4.1），不作模拟口径
 * - 握手（§3.2 镜像，待核验(09-27)）：管理中心填回调地址失焦即 POST
 *   verify_webhooks 事件，期望原样回 {"data":<数值>}——连接测试即此握手
 * - 应答（§3.3 镜像口径，照录注释）：每次请求 5s 建连超时即断；失败重试
 *   最多共推 3 次；官方无幂等键、消费方应做去重
 * - 范围（§2.3 禁令原文）：私信/客服无公开推送（能力域穷举 + 管理规约
 *   「不得以关联 UP 主名义对外发布评论、弹幕、私信」）——不入模板；直播
 *   双体系长连与投稿 API 属拉取/下行通道，不入推送模板
 * 字段说明与版本/来源由 definitions/bilibili/ 描述文件装载即校验。
 */

/** 版本化字段描述文件：四事件同文件，装载即校验（坏文件启动即炸） */
export const BILI_DEFINITIONS = parseChannelDefinition(eventsDefinitions);

/**
 * 官方成功语义（§3.3 镜像口径照录）：事件推送成功以 HTTP 200 计；正文无
 * 官方口径（仅 verify_webhooks 握手须回 {"data":<数值>}，由 Rust 探针承载）
 * ——空串 = 只看状态码。失败重试最多共推 3 次、5s 建连超时。
 */
export const BILI_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/**
 * 事件信封骨架（§2.2 官方包络键序：event → content → timestamp）：事件名
 * 即判型字段，由调用方覆写 content 与保持 timestamp 官方样本值。
 */
export function biliEnvelope(event: string, content: WirePayload): WirePayload {
  return { event, content, timestamp: "2021-01-01 12:01:01" };
}
