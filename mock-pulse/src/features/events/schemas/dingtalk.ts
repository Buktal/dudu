import { DINGTALK_APPROVAL_SCHEMAS } from "./dingtalk/approval";
import { DINGTALK_BOT_SCHEMAS } from "./dingtalk/bot";
import { DINGTALK_CONTACT_SCHEMAS } from "./dingtalk/contact";
import { DINGTALK_HANDSHAKE_SCHEMAS } from "./dingtalk/handshake";
import { DINGTALK_DEFINITIONS } from "./dingtalk/shared";

/**
 * 钉钉渠道协议元数据（新 HTTP 密文信封子形态，事实库 §2/§3/§5，不做 Stream /
 * 旧 oapi）：回调握手 4（dingtalk/handshake：check_url / check_create_suite_url /
 * check_update_suite_url / suite_ticket，解密后明文逐字）
 * + 审批 2（dingtalk/approval：bpms_instance_change / bpms_task_change，大写
 * HTTP 信封逐字）+ 通讯录 2（dingtalk/contact：user_modify_org / user_leave_org，
 * diffInfo 与字符串型 timeStamp 照录）+ 机器人收消息 6（dingtalk/bot：text 全量
 * 黄金样本 + picture/audio/video/file/richText 官方片段，明文通道）。
 * 载荷逐字取自 docs/research/channels/dingtalk.md 核验样本；字段说明与版本/
 * 来源由 definitions/dingtalk/ 分域描述文件装载即校验。密文信封 `{"encrypt"}`
 * + sha1 四参验签 + AES（PKCS#7-32、包尾 $key）与机器人 HmacSHA256 头由
 * Rust 适配器完成；事实库「待核验(09-27)」的其余事件族不进本票。
 */

export { DINGTALK_DEFINITIONS };

export const DINGTALK_SCHEMAS = [
  ...DINGTALK_HANDSHAKE_SCHEMAS,
  ...DINGTALK_APPROVAL_SCHEMAS,
  ...DINGTALK_CONTACT_SCHEMAS,
  ...DINGTALK_BOT_SCHEMAS,
] as const;
