import { MINI_AUTHORIZATION_EVENT_SCHEMAS } from "./wechat-mini/authorization";
import { MINI_EVENT_SCHEMAS } from "./wechat-mini/events";
import { MINI_MESSAGE_SCHEMAS } from "./wechat-mini/messages";
import { MINI_DEFINITIONS } from "./wechat-mini/shared";

/**
 * 小程序渠道协议元数据（事实库 docs/research/channels/wechat-mini.md）：
 * 数据格式官方 XML/JSON 双选，按事实库结论取 XML 为主。模板 3 客服接收包
 * （messages：text/image/miniprogrampage，官方 receive.html 全页仅此三包）
 * + 进入会话事件 1（events：user_enter_tempsession，官方无 user_enter_session）
 * + 授权变更事件 3（authorization：user_info_modified/user_authorization_revoke/
 * user_authorization_cancellation）。载荷逐字取自官方核验样本；字段说明与
 * 版本/来源由 definitions/wechat-mini/ 分域描述文件装载即校验。
 * 三模式加密信封（AES/尾部 AppId 校验/Nonce 复用请求值）由 Rust 适配器完成。
 * 事实库「待核验(09-27)」的 event_push 其余事件族（违规/物流/配送等）不进
 * 本票——官方无载荷正文，不编造。
 */

export { MINI_DEFINITIONS };

export const WECHAT_MINI_EVENT_SCHEMAS = [
  ...MINI_MESSAGE_SCHEMAS,
  ...MINI_EVENT_SCHEMAS,
  ...MINI_AUTHORIZATION_EVENT_SCHEMAS,
] as const;
