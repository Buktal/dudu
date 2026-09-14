import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  FEISHU_DEFINITIONS,
  FEISHU_EVENT_EXPECTED,
  feishuEnvelope,
  feishuHeaderIdGenerations,
} from "./shared";

/**
 * 飞书群组/通讯录/审批事件（事实库 §2.2–§2.4 + §5.7/§5.8/§5.9，逐字）：
 * im.chat.member.bot.added_v1（机器人进群）/ contact.user.deleted_v3（员工
 * 离职；department_ids 不返回值、以 old_object 为准）/ approval.approval.updated_v4
 * （审批定义更新；官方页为空串模板结构、header 用 event_create_time，逐字
 * 照录模板语义，ID 为示意填充）。
 */

/** 官方黄金样本 §5.9：im.chat.member.bot.added_v1 事件体（逐字） */
const goldenBotAddedEvent: WirePayload = {
  chat_id: "oc_413871888e0d5492e25b173f0812efb7",
  operator_id: {
    union_id: "on_8ed6aa67826108097d9ee143816345",
    user_id: "e33ggbyz",
    open_id: "ou_84aad35d084aa403a838cf73ee18467",
  },
  external: false,
  operator_tenant_key: "72ud6639",
  name: "Group name testing",
  i18n_names: {
    zh_cn: "群聊",
    en_us: "group chat",
    ja_jp: "グループチャット",
  },
};

/** 官方黄金样本 §5.7：contact.user.deleted_v3 事件体（逐字） */
const goldenContactDeletedEvent: WirePayload = {
  object: {
    open_id: "ou_7dab8a3d3cdcc9da365777c7ad535d62",
    union_id: "on_2b832a8c219b087c57208039282c0aa3",
    user_id: "e33ggbyz",
    name: "John",
    en_name: "San Zhang",
    nickname: "Sunny Zhang",
    email: "zhangsan@gmail.com",
    enterprise_email: "demo@mail.com",
    job_title: "software engineer",
    mobile: "12345678910",
    gender: 1,
    avatar: {
      avatar_72: "https://foo.icon.com/xxxx",
      avatar_240: "https://foo.icon.com/xxxx",
      avatar_640: "https://foo.icon.com/xxxx",
      avatar_origin: "https://foo.icon.com/xxxx",
    },
    status: {
      is_frozen: false,
      is_resigned: false,
      is_activated: true,
      is_exited: false,
      is_unjoin: false,
    },
    department_ids: ["od-4e6ac4d14bcd5071a37a39de902c7141"],
    leader_user_id: "ou_3ghm8a2u0eftg0ff377125s5dd275z09",
    city: "Hangzhou",
    country: "China",
    work_station: "Hangzhou",
    join_time: 1615381702,
    employee_no: "e33ggbyz",
    employee_type: 1,
    orders: [
      {
        department_id: "od-4e6ac4d14bcd5071a37a39de902c7141",
        user_order: 100,
        department_order: 100,
        is_primary_dept: true,
      },
    ],
    custom_attrs: [
      {
        type: "TEXT",
        id: "DemoId",
        value: {
          text: "DemoText",
          url: "http://www.fs.cn",
          pc_url: "http://www.fs.cn",
          option_id: "edcvfrtg",
          option_value: "option",
          name: "name",
          picture_url: "https://xxxxxxxxxxxxxxxxxx",
          generic_user: {
            id: "9b2fabg5",
            type: 1,
          },
        },
      },
    ],
    job_level_id: "mga5oa8ayjlp9rb",
    job_family_id: "mga5oa8ayjlp9rb",
    dotted_line_leader_user_ids: ["od-4e6ac4d14bcd5071a37a39de902c7141"],
  },
  old_object: {
    department_ids: ["od-4e6ac4d14bcxxxx"],
    open_id: "ou_xxxxxxxxxx",
  },
};

/** 官方黄金样本 §5.8：approval.approval.updated_v4（模板结构逐字；header 用
 *  event_create_time 且 timestamp 为字符串型秒级，ID 为示意填充非回归向量） */
const goldenApprovalUpdated: WirePayload = {
  schema: "2.0",
  header: {
    event_id: "b53e80a132ec090ba249a8bb74da0123",
    token: "ijuh4XAlBSRUIwhBFtLDSfWnIC61234",
    event_type: "approval.approval.updated_v4",
    app_id: "cli_xxx",
    tenant_key: "d6ae59e175fxxx",
    event_create_time: "1502199207.7171419",
  },
  event: {
    object: {
      approval_id: "74333067777841234",
      approval_code: "5B43240B-848C-49BD-9D27-11EF0EE11234",
      version_id: "7459343285667611234",
      widget_group_type: 0,
      form_definition_id: "7459341670005371234",
      process_obj: '{"lineList": xxx}',
      timestamp: "1736763698",
      extra: "",
    },
  },
};

export const FEISHU_EVENT_SCHEMAS = [
  defineSchema(FEISHU_DEFINITIONS, "fs-bot-added", {
    eventName: "im.chat.member.bot.added_v1",
    name: "机器人进群",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    idGenerations: [
      ...feishuHeaderIdGenerations(),
      { path: "event.chat_id", kind: "larkChatId" },
      { path: "event.operator_id.open_id", kind: "larkOpenId" },
      { path: "event.operator_id.union_id", kind: "larkUnionId" },
    ],
    payload: feishuEnvelope("im.chat.member.bot.added_v1", goldenBotAddedEvent),
  }),
  defineSchema(FEISHU_DEFINITIONS, "fs-contact-deleted", {
    eventName: "contact.user.deleted_v3",
    name: "员工离职",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    idGenerations: [
      ...feishuHeaderIdGenerations(),
      { path: "event.object.open_id", kind: "larkOpenId" },
      { path: "event.object.union_id", kind: "larkUnionId" },
    ],
    payload: feishuEnvelope(
      "contact.user.deleted_v3",
      goldenContactDeletedEvent,
    ),
  }),
  defineSchema(FEISHU_DEFINITIONS, "fs-approval-updated", {
    eventName: "approval.approval.updated_v4",
    name: "审批定义更新",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    // 官方页 header 用 event_create_time（秒级浮点字符串），仅 event_id 重新生成
    idGenerations: [{ path: "header.event_id", kind: "hexId32" }],
    payload: goldenApprovalUpdated,
  }),
] as const;
