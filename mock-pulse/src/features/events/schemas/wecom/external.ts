import { defineSchema } from "../define";
import type { XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventIdGenerations,
  wcSysEnvelope,
} from "./shared";

/**
 * 企微事件字典 · 客户联系（事实库 §2.5，92130）：
 * - change_external_contact：add_external_contact 逐字复刻官方 §5.5 黄金样本
 *   （State 渠道参数 + WelcomeCode），其余 5 个变更类型官方未收录字段明细，
 *   只携带服务人员/客户身份对（UserID + ExternalUserID），不编造。
 * - change_external_chat / change_external_tag：官方未收录字段明细
 *   （92128 待核验），载荷仅 ChangeType，可在完整报文页增补。
 * 全族 FromUserName=sys；§5.5 原文排版（tab 缩进 + sys 行尾空格）。
 */

/** 客户联系族排版：§5.5 官方样本（tab 缩进、ChangeType CDATA、FromUserName 行尾空格） */
const wcExternalContactLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime"],
  trailingSpaceTags: ["FromUserName"],
};

/** 外部联系人身份对：官方 §5.5 黄金样本值逐字 */
const externalIdentity = {
  UserID: "zhangsan",
  ExternalUserID: "woAJ2GCAAAXtWyujaWJHDDGi0mAAAA",
};

export const WECOM_AGENT_EXTERNAL_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-add-external-contact", {
    eventName: "change_external_contact",
    name: "客户联系 · 添加外部联系人",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_contact", "add_external_contact", {
      ...externalIdentity,
      State: "teststate",
      WelcomeCode: "WELCOMECODE",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-edit-external-contact", {
    eventName: "change_external_contact",
    name: "客户联系 · 编辑企业客户",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope(
      "change_external_contact",
      "edit_external_contact",
      externalIdentity,
    ),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-add-half-external-contact", {
    eventName: "change_external_contact",
    name: "客户联系 · 免验证添加成员",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope(
      "change_external_contact",
      "add_half_external_contact",
      externalIdentity,
    ),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-del-external-contact", {
    eventName: "change_external_contact",
    name: "客户联系 · 删除企业客户",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope(
      "change_external_contact",
      "del_external_contact",
      externalIdentity,
    ),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-del-follow-user", {
    eventName: "change_external_contact",
    name: "客户联系 · 删除跟进成员",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope(
      "change_external_contact",
      "del_follow_user",
      externalIdentity,
    ),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-transfer-fail", {
    eventName: "change_external_contact",
    name: "客户联系 · 客户接替失败",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope(
      "change_external_contact",
      "transfer_fail",
      externalIdentity,
    ),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-chat-create", {
    eventName: "change_external_chat",
    name: "客户群 · 创建",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_chat", "create"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-chat-update", {
    eventName: "change_external_chat",
    name: "客户群 · 变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_chat", "update"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-chat-dismiss", {
    eventName: "change_external_chat",
    name: "客户群 · 解散",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_chat", "dismiss"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-tag-create", {
    eventName: "change_external_tag",
    name: "客户标签 · 创建",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_tag", "create"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-tag-update", {
    eventName: "change_external_tag",
    name: "客户标签 · 变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_tag", "update"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-tag-delete", {
    eventName: "change_external_tag",
    name: "客户标签 · 删除",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_tag", "delete"),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-external-tag-shuffle", {
    eventName: "change_external_tag",
    name: "客户标签 · 重排",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcExternalContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_external_tag", "shuffle"),
  }),
] as const;
