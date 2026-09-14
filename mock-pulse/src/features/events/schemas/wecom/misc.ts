import { defineSchema } from "../define";
import type { WirePayload, XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventIdGenerations,
} from "./shared";

/**
 * 企微事件字典 · 其他回调域（事实库 §2.11）：
 * - security/change_domain_ip（100080）：企微域名/IP 变更，官方样本逐字
 *   （FromUserName=sys 行尾空格、无 AgentID）。
 * - public_email_change/receive_email（100180）：公共邮箱收到邮件，
 *   官方样本逐字（三空格缩进、Id/Amount 数值裸文本）。
 */

/** 官方黄金样本 §2.11：域名/IP 变更（100080 原文逐字） */
const goldenWcChangeDomainIp: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "sys",
  CreateTime: "1403610513",
  MsgType: "event",
  Event: "security",
  ChangeType: "change_domain_ip",
};

/** 官方黄金样本 §2.11：公共邮箱收到邮件（100180 原文逐字） */
const goldenWcReceiveEmail: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "sys",
  CreateTime: "1668831860",
  MsgType: "event",
  Event: "public_email_change",
  ChangeType: "receive_email",
  Id: "1",
  Amount: "2",
};

/** 域名 IP 变更排版：100080 官方样本（tab 缩进 + sys 行尾空格） */
const wcDomainIpLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime"],
  trailingSpaceTags: ["FromUserName"],
};

/** 公共邮箱排版：100180 官方样本（三空格缩进 + sys 行尾空格 + Id/Amount 裸文本） */
const wcPublicEmailLayout: XmlLayout = {
  indent: "   ",
  bareTags: ["CreateTime", "Id", "Amount"],
  trailingSpaceTags: ["FromUserName"],
};

export const WECOM_AGENT_MISC_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-security-change-domain-ip", {
    eventName: "security",
    name: "域名/IP 变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcDomainIpLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcChangeDomainIp,
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-public-email-receive", {
    eventName: "public_email_change",
    name: "公共邮箱 · 收到邮件",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcPublicEmailLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcReceiveEmail,
  }),
] as const;
