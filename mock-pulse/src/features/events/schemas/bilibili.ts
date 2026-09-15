import { BILI_EVENT_SCHEMAS } from "./bilibili/events";
import { BILI_DEFINITIONS } from "./bilibili/shared";

/**
 * B站渠道协议元数据（开放平台 Webhooks，事实库
 * docs/research/channels/bilibili.md）：封闭 4 事件（授权 authorize /
 * 解除授权 deauthorize / 稿件开放浏览 video_open / 投稿失败 video_fail，
 * bili/events：deauthorize 官方原文印证 + 其余三行镜像口径、样本逐字 +
 * 待核验注明）。全部 wire = json（HTTPS POST 明文 JSON，无加密记载）。
 * 验证/握手：x-bili-* 服务端签名头表（官方摘录实锤）+ Authorization =
 * HMAC-SHA256，verify_webhooks 握手（镜像口径，失焦即发、期望原样回
 * {"data":<数值>}）——签名与探针由 Rust 适配器完成；应答 200、5s 建连
 * 超时、失败最多共推 3 次、官方无幂等键需消费方去重；私信/客服无公开
 * 推送（禁令原文）不入模板，直播双体系长连不入推送模板。
 */

export { BILI_DEFINITIONS };

export const BILI_SCHEMAS = [...BILI_EVENT_SCHEMAS] as const;
