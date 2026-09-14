import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  FEISHU_DEFINITIONS,
  FEISHU_EVENT_EXPECTED,
  feishuEnvelope,
  feishuHeaderIdGenerations,
} from "./shared";

/**
 * 飞书 IM 消息事件（事实库 §2.1 + §5.4–§5.6 官方样本，逐字）：
 * im.message.receive_v1（收消息）/ im.message.message_read_v1（已读，官方
 * 真名 message_read）/ im.message.recalled_v1（撤回，官方真名 recalled）。
 * 消息类幂等键是 message_id 而非 event_id（官方口径），receive 事件的
 * content 为 JSON 序列化字符串（字段说明标注于描述文件）。
 */

/** 官方黄金样本 §5.4：im.message.receive_v1 事件体（逐字；content 为 JSON 串） */
const goldenReceiveEvent: WirePayload = {
  sender: {
    sender_id: {
      union_id: "on_8ed6aa67826108097d9ee143816345",
      user_id: "e33ggbyz",
      open_id: "ou_84aad35d084aa403a838cf73ee18467",
    },
    sender_type: "user",
    tenant_key: "736588c9260f175e",
  },
  message: {
    message_id: "om_5ce6d572455d361153b7cb51da133945",
    root_id: "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
    parent_id: "om_5ce6d572455d361153b7cb5xxfsdfsdfdsf",
    create_time: "1609073151345",
    update_time: "1687343654666",
    chat_id: "oc_5ce6d572455d361153b7xx51da133945",
    thread_id: "omt_d4be107c616",
    chat_type: "group",
    message_type: "text",
    content: '{"text":"@_user_1 hello"}',
    mentions: [
      {
        key: "@_user_1",
        id: {
          union_id: "on_8ed6aa67826108097d9ee143816345",
          user_id: "e33ggbyz",
          open_id: "ou_84aad35d084aa403a838cf73ee18467",
        },
        mentioned_type: "user",
        name: "Tom",
        tenant_key: "736588c9260f175e",
      },
    ],
    user_agent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_2_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.53 Safari/537.36 Lark/6.7.5 LarkLocale/en_US ttnet SDK-Version/6.7.8",
  },
};

/** 官方黄金样本 §5.5：im.message.message_read_v1 事件体（逐字） */
const goldenMessageReadEvent: WirePayload = {
  reader: {
    reader_id: {
      union_id: "on_8ed6aa67826108097d9ee143816345",
      user_id: "e33ggbyz",
      open_id: "ou_84aad35d084aa403a838cf73ee18467",
    },
    read_time: "1609484183000",
    tenant_key: "736588c9260f175e",
  },
  message_id_list: ["om_dc13264520392913993dd051dba21dcf"],
};

/** 官方黄金样本 §5.6：im.message.recalled_v1 事件体（逐字） */
const goldenRecalledEvent: WirePayload = {
  message_id: "om_dc13264520392913993dd051dba21dcf",
  chat_id: "oc_5ad11d72b830411d72b836c20",
  recall_time: "1615380573411",
  recall_type: "message_owner",
};

export const FEISHU_IM_SCHEMAS = [
  defineSchema(FEISHU_DEFINITIONS, "fs-message-receive", {
    eventName: "im.message.receive_v1",
    name: "接收消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    idGenerations: [
      ...feishuHeaderIdGenerations(),
      { path: "event.sender.sender_id.open_id", kind: "larkOpenId" },
      { path: "event.sender.sender_id.union_id", kind: "larkUnionId" },
      { path: "event.message.message_id", kind: "larkMessageId" },
      { path: "event.message.create_time", kind: "createTimeMsString" },
      { path: "event.message.update_time", kind: "createTimeMsString" },
      {
        path: "event.mentions[0].id.open_id",
        kind: "larkOpenId",
        sameAs: "event.sender.sender_id.open_id",
      },
      {
        path: "event.mentions[0].id.union_id",
        kind: "larkUnionId",
        sameAs: "event.sender.sender_id.union_id",
      },
    ],
    payload: feishuEnvelope("im.message.receive_v1", goldenReceiveEvent),
  }),
  defineSchema(FEISHU_DEFINITIONS, "fs-message-read", {
    eventName: "im.message.message_read_v1",
    name: "消息已读",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    idGenerations: [
      ...feishuHeaderIdGenerations(),
      { path: "event.reader.reader_id.open_id", kind: "larkOpenId" },
      { path: "event.reader.reader_id.union_id", kind: "larkUnionId" },
      { path: "event.message_id_list[0]", kind: "larkMessageId" },
    ],
    payload: feishuEnvelope(
      "im.message.message_read_v1",
      goldenMessageReadEvent,
    ),
  }),
  defineSchema(FEISHU_DEFINITIONS, "fs-message-recalled", {
    eventName: "im.message.recalled_v1",
    name: "消息撤回",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: FEISHU_EVENT_EXPECTED,
    idGenerations: [
      ...feishuHeaderIdGenerations(),
      { path: "event.message_id", kind: "larkMessageId" },
    ],
    payload: feishuEnvelope("im.message.recalled_v1", goldenRecalledEvent),
  }),
] as const;
