import douyinDefinition from "../definitions/douyin.json";
import { parseChannelDefinition } from "../definitions/loader";
import { defineSchema } from "./define";
import type { ExpectedReceipt, IdGeneration, WirePayload } from "./types";

/**
 * 抖音渠道协议元数据（dop · JSON 回调）。
 * 载荷与协议事实：docs/research/channels/douyin.md；
 * 字段说明与版本/来源由 ../definitions/douyin.json 经 loader 装载即校验。
 * 新增抖音模板 = 本模块加一个黄金载荷条目 + 描述文件加一份字段定义。
 */

/** 版本化字段描述文件：随应用分发，装载即校验（坏文件启动即炸） */
export const DOUYIN_DEFINITIONS = parseChannelDefinition(douyinDefinition);

/** 抖音官方成功语义：dop Webhooks 以 HTTP 200 判成功（2.5s/5s 超时驱动重试），正文不校验 */
const DOUYIN_EXPECTED: ExpectedReceipt = {
  status: 200,
  body: "",
  bodyMode: "contains",
};

/** 信封 + 会话 + 资料的 ID 生成规则（文本/图片/进入会话共用；
 *  仅对模板载荷中已存在的路径生效，见 applyGeneratedIds） */
function dyMessageIdGenerations(): IdGeneration[] {
  return [
    { path: "from_user_id", kind: "openId" },
    { path: "to_user_id", kind: "openId" },
    { path: "log_id", kind: "logId" },
    { path: "content.conversation_short_id", kind: "encryptedId" },
    { path: "content.server_message_id", kind: "encryptedId" },
    { path: "content.create_time", kind: "createTimeMs" },
    {
      path: "content.user_infos[0].open_id",
      kind: "openId",
      sameAs: "from_user_id",
    },
    {
      path: "content.user_infos[1].open_id",
      kind: "openId",
      sameAs: "to_user_id",
    },
  ];
}

/** 官方黄金样本 §5.10：IM 文本消息完整示例（含 user_infos，逐字；log_id 官方示例未携带，由生成规则补齐） */
const goldenDyText: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
  to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
  content: {
    conversation_short_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPiLPZVyrQmgKVQabPH460zdRmYqig357zEBMaXjKvvhvwY02ISB7llsWQ==",
    server_message_id:
      "@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPpF2rgykLFgbafb560zdRmYqig357zEBmWXVPshhwyd/y/7BQpXy/w==",
    conversation_type: 1,
    create_time: 1681303285997,
    message_type: "text",
    source: "",
    text: "捷途70",
    index: "1672502407220000",
    user_infos: [
      {
        open_id: "aaa-ae9b-4dbf-add1-bf67e4093fab",
        nick_name: "刘东",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxx-avatar/mosaic-legacy_3795_3047680722.jpeg?from=3782654143",
      },
      {
        open_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
        nick_name: "毕节--捷途万丰店",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/xxxxxx-avatar/tos-cn-avt-0015_6c9ae9afb4e62e2263f98809e3dc5b6a.jpeg?from=3782654143",
      },
    ],
  },
};

/** 官方黄金样本 §5.7：IM 图片消息（无 text 字段，逐字） */
const goldenDyImage: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "ac6479a5-d7a6-4018-84be-c29bfc00000",
  to_user_id: "8067f050-f8cf-4fa3-9357-c29bfc00000",
  content: {
    conversation_short_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0QfA0VnmRejrzWUBwDdDYrU9MpJSYEVV6/2hKU0il5iay8J99+0t5j3zrbA==",
    server_message_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc0RPc0VHKefj/yWEJ8DtjUrU9MpJSYEVV6/2hKrOcqY1gIxctCXW23v4oW/Q==",
    conversation_type: 1,
    create_time: 1656571939562,
    message_type: "image",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.11：im_enter_direct_msg（content 为 json 字符串，逐字） */
const goldenDyEnter: WirePayload = {
  event: "im_enter_direct_msg",
  client_key: "aaaoqobz68a71u1",
  from_user_id: "aaa-8a0b-4c0f-b04f-feba0e909113",
  to_user_id: "aaa-81ec-424c-b738-8693eeaf53ea",
  content:
    '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b604448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}',
};

/** 官方黄金样本 §5.13：im_message_read（逐字） */
const goldenDyRead: WirePayload = {
  event: "im_message_read",
  client_key: "ttddf8ab4542c7d76601",
  from_user_id: "_000f9pF8lTroNtA9pfLjPohf1qIUzLdiWRs",
  to_user_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  content: {
    conversation_short_id:
      "@4F8A0vXKXctkaiPzY485F6f81WSGOvmFOJB3rwivKFMQaPT00HDnemIujgn96zUFraoX3c4RU8SOd4uRCKWmdg==",
    index: "1672502407220000",
    conversation_type: 1,
    read_open_id: "_000bfeGRgbkwDMMksxyg4auRqXAPGIZk1pl",
  },
};

export const DOUYIN_EVENT_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-text", {
    eventName: "im_receive_msg",
    name: "接收私信 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOUYIN_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyText,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-image", {
    eventName: "im_receive_msg",
    name: "接收私信 · 图片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOUYIN_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyImage,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-enter", {
    eventName: "im_enter_direct_msg",
    name: "进入私信会话",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOUYIN_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEnter,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-read", {
    eventName: "im_message_read",
    name: "私信已读",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOUYIN_EXPECTED,
    // 已读事件无 user_infos，身份组由发送者与已读用户构成（字段集见描述文件）
    idGenerations: [
      { path: "from_user_id", kind: "openId" },
      { path: "to_user_id", kind: "openId" },
      { path: "log_id", kind: "logId" },
      { path: "content.conversation_short_id", kind: "encryptedId" },
      { path: "content.create_time", kind: "createTimeMs" },
      { path: "content.read_open_id", kind: "openId", sameAs: "to_user_id" },
    ],
    payload: goldenDyRead,
  }),
] as const;
