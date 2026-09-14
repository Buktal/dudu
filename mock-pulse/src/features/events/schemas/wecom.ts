import { WECOM_AGENT_ACQUISITION_EVENT_SCHEMAS } from "./wecom/acquisition";
import { WECOM_AIBOT_SCHEMAS } from "./wecom/aibot";
import { WECOM_AGENT_CARD_EVENT_SCHEMAS } from "./wecom/cards";
import { WECOM_AGENT_CHAIN_EVENT_SCHEMAS } from "./wecom/chain";
import { WECOM_AGENT_CONTACT_EVENT_SCHEMAS } from "./wecom/contact";
import { WECOM_AGENT_CORE_EVENT_SCHEMAS } from "./wecom/events";
import { WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS } from "./wecom/external";
import { WECOM_AGENT_INTERACTION_EVENT_SCHEMAS } from "./wecom/interaction";
import { WECOM_KF_EVENT_SCHEMAS } from "./wecom/kf";
import { WECOM_AGENT_LIFECYCLE_EVENT_SCHEMAS } from "./wecom/lifecycle";
import { WECOM_AGENT_MENU_EVENT_SCHEMAS } from "./wecom/menu";
import { WECOM_AGENT_MESSAGE_SCHEMAS } from "./wecom/messages";
import { WECOM_AGENT_MISC_EVENT_SCHEMAS } from "./wecom/misc";
import { WECOM_AGENT_OA_EVENT_SCHEMAS } from "./wecom/oa";
import { WECOM_AGENT_ROOM_EVENT_SCHEMAS } from "./wecom/room";
import { WECOM_DEFINITIONS } from "./wecom/shared";

/**
 * 企微渠道协议元数据（两条通道聚合，事实库 docs/research/channels/wecom.md）：
 * - 自建应用 XML 通道（90239/90240/90970/90971/90972/92032/92052/92130/97299/
 *   91815/94670/95796/95333/100080/100180）：成员消息 6 MsgType（wecom/messages）
 *   + 事件字典全量（wecom/events、menu、interaction、cards、lifecycle、contact、
 *   external、acquisition、oa、kf、chain、room、misc）
 * - 智能机器人 JSON 通道（100719/101027）：收消息 7 msgtype + 收事件 4 种（wecom/aibot）
 * 载荷逐字取自官方核验样本；字段说明与版本/来源由 definitions/wecom/
 * 分通道描述文件装载即校验。加密信封（AES/receiveid）由 Rust 适配器完成。
 */

export { WECOM_DEFINITIONS };

export const WECOM_EVENT_SCHEMAS = [
  ...WECOM_AGENT_MESSAGE_SCHEMAS,
  ...WECOM_AGENT_CORE_EVENT_SCHEMAS,
  ...WECOM_AGENT_MENU_EVENT_SCHEMAS,
  ...WECOM_AGENT_INTERACTION_EVENT_SCHEMAS,
  ...WECOM_AGENT_CARD_EVENT_SCHEMAS,
  ...WECOM_AGENT_LIFECYCLE_EVENT_SCHEMAS,
  ...WECOM_AGENT_CONTACT_EVENT_SCHEMAS,
  ...WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS,
  ...WECOM_AGENT_ACQUISITION_EVENT_SCHEMAS,
  ...WECOM_AGENT_OA_EVENT_SCHEMAS,
  ...WECOM_KF_EVENT_SCHEMAS,
  ...WECOM_AGENT_CHAIN_EVENT_SCHEMAS,
  ...WECOM_AGENT_ROOM_EVENT_SCHEMAS,
  ...WECOM_AGENT_MISC_EVENT_SCHEMAS,
  ...WECOM_AIBOT_SCHEMAS,
] as const;
