import { WA_MANAGEMENT_SCHEMAS } from "./whatsapp/management";
import { WA_MESSAGES_SCHEMAS } from "./whatsapp/messages";
import { WA_DEFINITIONS } from "./whatsapp/shared";

/**
 * WhatsApp 渠道协议元数据（Cloud API Webhook，事实库 docs/research/channels/
 * whatsapp.md——单 URL + 必订 messages；仅 HTTPS + 签名、无加密）：入站文本
 * 1（wa/inbound：§5.1 set-up-webhooks 页核验样本逐字）+ 出站状态 4
 * （wa/status：delivered §5.2 核验样本逐字，sent/read/failed 按 §2.1 枚举
 * 与错误挂载口径构造）+ 管理面组件事件 4（wa/management：模板状态/号码吞吐
 * §5.4/§5.5 核验样本逐字，capability/account 按组件表字段名构造代表）。
 * 传输/验签/握手同族：POST 明文 JSON + 头 X-Hub-Signature-256 =
 * "sha256=" + hex(HMAC-SHA256(AppSecret, 原始 body))，回 HTTP 200 即成功
 * （正文无口径，非 200 或不可达递减重试最长 7 天）——验签与 GET 三参握手
 * 由 Rust 适配器完成。
 */

export { WA_DEFINITIONS };

export const WA_SCHEMAS = [
  ...WA_MESSAGES_SCHEMAS,
  ...WA_MANAGEMENT_SCHEMAS,
] as const;
