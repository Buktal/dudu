import { QQ_GUILD_SCHEMAS } from "./qq/guild";
import { QQ_MESSAGE_SCHEMAS } from "./qq/messages";
import { QQ_RELATION_SCHEMAS } from "./qq/relations";
import { QQ_DEFINITIONS } from "./qq/shared";
import { QQ_VERIFY_SCHEMAS } from "./qq/verify";

/**
 * QQ 机器人渠道协议元数据（Webhook 子形态，事实库 §2/§3/§5，不做 WS 网关）：
 * op13 验证回调 1（qq/verify：官方验证回调请求逐字，目标回包验签为 qqSignReply）
 * + 单聊/群消息 3（qq/messages：C2C / 群 @ 黄金样本逐字，群全量按字段清单组合）
 * + 频道消息 2（qq/guild：AT 黄金样本逐字，私信 Message 对象同构）+ 关系链 2
 * （qq/relations：FRIEND_ADD / GROUP_ADD_ROBOT 黄金样本逐字）。
 * 载荷逐字取自 docs/research/channels/qq.md 核验样本；信封四件套 id/op/d/s/t
 * 按 §5.1 官方形态（id 为官方占位符原文 event_id、s 取官方样本值 42）。
 * Ed25519 验签（seed = AppSecret 翻倍截断 32 字节）与 op13 回包校验由 Rust
 * 适配器完成；老 Token 鉴权已废弃（事实库 §6），不设 Token 凭证。
 */

export { QQ_DEFINITIONS };

export const QQ_SCHEMAS = [
  ...QQ_VERIFY_SCHEMAS,
  ...QQ_MESSAGE_SCHEMAS,
  ...QQ_GUILD_SCHEMAS,
  ...QQ_RELATION_SCHEMAS,
] as const;
