import { MP_BASIC_EVENT_SCHEMAS } from "./wechat-mp/events";
import { MP_MENU_EVENT_SCHEMAS } from "./wechat-mp/menu";
import { MP_MESSAGE_SCHEMAS } from "./wechat-mp/messages";
import { MP_RECEIPT_EVENT_SCHEMAS } from "./wechat-mp/receipts";
import { MP_DEFINITIONS } from "./wechat-mp/shared";

/**
 * 公众号渠道协议元数据（事实库 docs/research/channels/wechat-mp.md）：
 * 推送仅 XML（§2），模板 7 普通消息（messages）+ 6 基础事件（events）
 * + 菜单扩展 8 形态（menu，菜单页 CLICK 与基础事件共形共用 wm-click）
 * + 模板/群发/订阅通知回执 5 事件（receipts）。
 * 载荷逐字取自官方核验样本；字段说明与版本/来源由 definitions/wechat-mp/
 * 分域描述文件装载即校验。三模式加密信封（AES/尾部 AppId 校验）由 Rust 适配器完成。
 */

export { MP_DEFINITIONS };

export const WECHAT_MP_EVENT_SCHEMAS = [
  ...MP_MESSAGE_SCHEMAS,
  ...MP_BASIC_EVENT_SCHEMAS,
  ...MP_MENU_EVENT_SCHEMAS,
  ...MP_RECEIPT_EVENT_SCHEMAS,
] as const;
