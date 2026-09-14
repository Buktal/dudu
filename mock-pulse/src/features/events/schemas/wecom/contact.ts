import { defineSchema } from "../define";
import type { XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcCdataEventLayout,
  wcChangeContactLayout,
  wcEventIdGenerations,
  wcSysEnvelope,
} from "./shared";

/**
 * 企微事件字典 · 通讯录变更族与家校通讯录（事实库 §2.3/§2.4）：
 * - change_contact（90970/90971/90972）：create_user 黄金样本在 events 模块，
 *   此处补全 update_user/delete_user（90970）、create/update/delete_party
 *   （90971）、update_tag（90972，官方明示该页走 CDATA）。
 * - change_school_contact（92032/92052）：载荷极简（Event/ChangeType/Id），
 *   部门族 ChangeType 官方原文笔误 `deparmtment` 照抄。
 * 官方样本均不携带 AgentID/MsgId；update_user 按官方精简回调规则
 * 只携带 UserID/Department/NewUserID 三字段。
 */

/** 家校学生/家长族排版：Id 为家校通讯录 userid（CDATA），部门族走 wcSchoolDepartmentLayout */
const wcSchoolContactLayout: XmlLayout = wcCdataEventLayout;

/** 家校部门族排版：Id 为部门数字 id，裸文本输出（官方数字化字段惯例） */
const wcSchoolDepartmentLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "Id"],
};

/** 部门变更排版：90971 域沿用 §5.4 风格（ChangeType/数值字段裸文本 + sys 行尾空格） */
const wcChangePartyLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "ChangeType", "Id", "ParentId", "Order"],
  trailingSpaceTags: ["FromUserName"],
};

export const WECOM_AGENT_CONTACT_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-update-user", {
    eventName: "change_contact",
    name: "通讯录变更 · 更新成员",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangeContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "update_user", {
      UserID: "zhangsan",
      NewUserID: "zhangsan1",
      Department: "1,2,3",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-delete-user", {
    eventName: "change_contact",
    name: "通讯录变更 · 删除成员",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangeContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "delete_user", {
      UserID: "zhangsan",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-create-party", {
    eventName: "change_contact",
    name: "通讯录变更 · 新增部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangePartyLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "create_party", {
      Id: "2",
      Name: "研发部",
      ParentId: "1",
      Order: "10",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-update-party", {
    eventName: "change_contact",
    name: "通讯录变更 · 更新部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangePartyLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "update_party", {
      Id: "2",
      Name: "研发部",
      ParentId: "1",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-delete-party", {
    eventName: "change_contact",
    name: "通讯录变更 · 删除部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcChangePartyLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "delete_party", { Id: "2" }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-update-tag", {
    eventName: "change_contact",
    name: "通讯录变更 · 标签成员变更",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcCdataEventLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_contact", "update_tag", {
      TagId: "1",
      AddUserItems: "zhangsan,lisi",
      DelUserItems: "wangwu",
      AddPartyItems: "2",
      DelPartyItems: "3",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-create-student", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 新增学生",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "create_student", {
      Id: "STUDENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-update-student", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 编辑学生",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "update_student", {
      Id: "STUDENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-delete-student", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 删除学生",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "delete_student", {
      Id: "STUDENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-create-parent", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 新增家长",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "create_parent", {
      Id: "PARENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-update-parent", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 编辑家长",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "update_parent", {
      Id: "PARENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-delete-parent", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 删除家长",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "delete_parent", {
      Id: "PARENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-subscribe", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 家长关注",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "subscribe", {
      Id: "PARENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-unsubscribe", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 家长取消关注",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolContactLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "unsubscribe", {
      Id: "PARENT_USERID",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-create-deparmtment", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 新增部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolDepartmentLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "create_deparmtment", {
      Id: "1",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-update-deparmtment", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 编辑部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolDepartmentLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "update_deparmtment", {
      Id: "1",
    }),
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-school-delete-deparmtment", {
    eventName: "change_school_contact",
    name: "家校通讯录 · 删除部门",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcSchoolDepartmentLayout,
    idGenerations: wcEventIdGenerations(),
    payload: wcSysEnvelope("change_school_contact", "delete_deparmtment", {
      Id: "1",
    }),
  }),
] as const;
