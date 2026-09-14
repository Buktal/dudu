import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  DOP_EXPECTED,
  DOUYIN_DEFINITIONS,
  dyEnvelopeIdGenerations,
  dySkeletonEnvelope,
} from "./shared";

/**
 * 抖音 dop 主体系事件（事实库 §2.1 事件目录 + §5 黄金样本，逐字）：
 * create_video / authorize / unauthorize / contract_* / union_auth_* /
 * new_video_digg / new_follow_action / 群聊四事件 / service_market_order。
 * IM 私信明细（receive/send/enter/recall/read 及 message_type 变体）在 ./im。
 */

/** 官方黄金样本 §5.2：create_video（逐字；事件名取自官方注释） */
const goldenDyCreateVideo: WirePayload = {
  event: "create_video",
  from_user_id: "",
  client_key: "",
  content: {
    item_id: "",
    share_id: "",
  },
};

/** 官方黄金样本 §5.3：authorize / unauthorize（逐字；事件名取自官方注释） */
const goldenDyAuthorize: WirePayload = {
  event: "authorize",
  from_user_id: "",
  client_key: "",
  content: {
    scopes: [],
  },
};

/** 官方黄金样本 §5.14：new_video_digg（逐字，content 为 json 字符串） */
const goldenDyNewVideoDigg: WirePayload = {
  event: "new_video_digg",
  client_key: "awr8bfr64vxgk036",
  from_user_id: "5adb9d61-b91a-4382-8252-b0cea8793e35",
  to_user_id: "e3af6e1d-d83a-4116-8f9f-5cb8ac2413c7",
  content:
    '{"action_type":1,"action_time":1686817996,"item_id":"@9VwWjvGUTp9kKW+ma4huFs791WPtO/mAPpx3rg6nL1kRbfn/60zdRmYqig357zEBDoyWkKJYf4Ae9sL0fd9gYw=="}',
  log_id: "20230615163316517143EDD4CEF10721B6",
};

/** 官方黄金样本 §5.14：new_follow_action（逐字，content 为 json 字符串） */
const goldenDyNewFollow: WirePayload = {
  event: "new_follow_action",
  client_key: "awr8bfr64vxgk036",
  from_user_id: "5bfa0218-477c-4d51-865c-64f0588794a6",
  to_user_id: "e3af6e1d-d83a-4116-8f9f-5cb8ac2413c7",
  content: '{"action_type":1,"action_time":1686811643}',
  log_id: "202306151447300000000000005369C6D",
};

/** 官方黄金样本 §5.15：contract_authorize（逐字，content 为 json 字符串） */
const goldenDyContractAuthorize: WirePayload = {
  event: "contract_authorize",
  from_user_id: "",
  client_key: "",
  content: '{"scopes":["经营Scope"],"timestamp":123456789}',
};

/** 官方黄金样本 §5.16：service_market_order（逐字，content 为 json 字符串，
 *  unstringify 后结构见事实库；service_id 官方原文即带掩码星号） */
const goldenDyServiceMarketOrder: WirePayload = {
  event: "service_market_order",
  client_key: "awa3utacdjjpxxxx",
  from_user_id: "c97cdcb3-76a1-433b-92c9-7abc6241xxxx",
  content:
    '{"order_id":"701913106392234xxxx","order_event":1,"order_snapshot":{"order_id":"701913106392234xxxx","service_id":"7021602203591******","service_name":"服务名称","service_mode_id":"standard_1","specification_type":3,"specification_title":"标准版","create_time":1631850028000,"order_event_time":1631850028000},"purchase_info":{"order_id":"701913106392234xxxx","service_id":"7021602203591******","service_mode_id":"standard_1","specification_type":3,"effective_time":1651409686000,"expire_time":1651841686602}}',
  log_id: "2022090211081801013502322010023F26",
};

export const DOUYIN_DOP_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-create-video", {
    eventName: "create_video",
    name: "分享视频到抖音",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: [
      { path: "from_user_id", kind: "openId" },
      { path: "content.item_id", kind: "encryptedId" },
    ],
    payload: goldenDyCreateVideo,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-authorize", {
    eventName: "authorize",
    name: "授权应用",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: goldenDyAuthorize,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-unauthorize", {
    eventName: "unauthorize",
    name: "解除授权",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: { ...goldenDyAuthorize, event: "unauthorize" },
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-contract-authorize", {
    eventName: "contract_authorize",
    name: "经营关系授权",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: goldenDyContractAuthorize,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-contract-unauthorize", {
    eventName: "contract_unauthorize",
    name: "经营关系解除授权",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: { ...goldenDyContractAuthorize, event: "contract_unauthorize" },
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-union-auth-c", {
    eventName: "union_auth_info_for_c",
    name: "联合授权通知 · C 端",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    // 官方事件目录未给该事件示例，按 §5.1 统一信封 + 空 content 装载
    payload: dySkeletonEnvelope("union_auth_info_for_c"),
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-union-auth-b", {
    eventName: "union_auth_info_for_b",
    name: "联合授权通知 · B 端",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: dySkeletonEnvelope("union_auth_info_for_b"),
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-new-video-digg", {
    eventName: "new_video_digg",
    name: "视频点赞",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: [
      ...dyEnvelopeIdGenerations(),
      { path: "content.action_time", kind: "createTimeSecNumber" },
      { path: "content.item_id", kind: "encryptedId" },
    ],
    payload: goldenDyNewVideoDigg,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-new-follow", {
    eventName: "new_follow_action",
    name: "新增关注",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: [
      ...dyEnvelopeIdGenerations(),
      { path: "content.action_time", kind: "createTimeSecNumber" },
    ],
    payload: goldenDyNewFollow,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-group-audit", {
    eventName: "enter_group_audit_change",
    name: "加群申请",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    // 官方仅给空 content（字段明细待核验，事实库 §2.3）
    payload: dySkeletonEnvelope("enter_group_audit_change"),
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-group-fans", {
    eventName: "group_fans_event",
    name: "加群成功",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: dySkeletonEnvelope("group_fans_event"),
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-im-group-receive", {
    eventName: "im_group_receive_msg",
    name: "群聊收消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    // 官方 §5.4 信封骨架逐字（event/client_key/from_user_id/to_user_id/content）
    payload: {
      event: "im_group_receive_msg",
      client_key: "",
      from_user_id: "",
      to_user_id: "",
      content: {},
    },
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-im-group-send", {
    eventName: "im_group_send_msg",
    name: "群聊发消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: {
      event: "im_group_send_msg",
      client_key: "",
      from_user_id: "",
      to_user_id: "",
      content: {},
    },
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-service-market-order", {
    eventName: "service_market_order",
    name: "服务市场订单",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyEnvelopeIdGenerations(),
    payload: goldenDyServiceMarketOrder,
  }),
] as const;
