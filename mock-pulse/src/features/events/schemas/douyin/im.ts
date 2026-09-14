import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import {
  DOP_EXPECTED,
  DOUYIN_DEFINITIONS,
  dyEnvelopeIdGenerations,
  dyMessageIdGenerations,
} from "./shared";

/**
 * 抖音 IM 私信明细事件（事实库 §2.2/§2.3 + §5 黄金样本，逐字）：
 * im_receive_msg / im_send_msg 的 message_type 变体（text/image/user_local_image/
 * emoji/video/retain_consult_card + 企业号线索组件 leads_phone_card）、
 * im_enter_direct_msg / im_recall_msg / im_message_read。
 * dop IM 事件本质是企业号私信推送（信封与 dop 主体系一致，验签同 dop）。
 */

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

/** 官方黄金样本 §5.7 同构变体：user_local_image（官方注明仅 message_type 不同） */
const goldenDyLocalImage: WirePayload = {
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
    message_type: "user_local_image",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.6：IM 表情消息（逐字） */
const goldenDyEmoji: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "eeb0ea9b-bed4-4b70-913d-c29bfc00000",
  to_user_id: "aaa-7ae0-4399-914a-5eb1df5861ba",
  content: {
    conversation_short_id:
      "@c29bfc000+MNggFhRkwGuX1ntucyQ/A1Wn+VfTX3Vk9xDdDQrU9MpJSYEVV6/2hK6gbUC8gjaV/y3CS18WtfMw==",
    server_message_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc1RPw2VXmSfjn/VE9zCtHSrU9MpJSYEVV6/2hKk8cLQDaYzbQpImhvw1Y4FQ==",
    conversation_type: 1,
    create_time: 1656671771668,
    message_type: "emoji",
    resource_type: "gif",
    resource_width: 450,
    resource_height: 450,
    resource_url: "",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.8：IM 视频分享（逐字） */
const goldenDyVideo: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "eeb0ea9b-bed4-4b70-913d-c29bfc00000",
  to_user_id: "8067f050-f8cf-4fa3-9357-c29bfc00000",
  content: {
    conversation_short_id:
      "@c29bfc000+MNggFhRkwGuX1ntucyQ/A1Wn+VfTX3Vk9xDdDQrU9MpJSYEVV6/2hK6gbUC8gjaV/y3CS18WtfMw==",
    server_message_id:
      "@c29bfc000+MNggFhRkwGuX1ntuc1RPw2VXmSfjn/VE9zCtHSrU9MpJSYEVV6/2hKk8cLQDaYzbQpImhvw1Y4FQ==",
    conversation_type: 1,
    create_time: 1656671771668,
    message_type: "video",
    item_id:
      "@72NwHyW53+MNggFhRkwGuX1ntuc2RfUyVnKfdTzwU0F0CtjUrU9MpJSYEVV6/2hKy3NMVbBhh6BW27IsDFieLg==",
    index: "1672502407220000",
  },
};

/** 官方黄金样本 §5.9：IM 留资卡片-完成态（逐字；官方原文缺 index 行尾逗号，JSON 修整） */
const goldenDyRetainCard: WirePayload = {
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
    message_type: "retain_consult_card",
    index: "1672502407220000",
    card_id:
      "@72MqAjfymKYS1xNrB0sG4X1iidgOeMsMbUSpQwLJb3kYzJh7eXsSr5+aH2GTsvEv",
    card_status: 2,
    card_data: [
      { label: "姓名", value: "Tonality" },
      { label: "手机号", value: "12345678901" },
      { label: "城市", value: "北京市北京市海淀区" },
    ],
  },
};

/** 官方黄金样本 §5.18：企业号线索组件消息 leads_phone_card（逐字 content；
 *  源页仅展示 content 部分，信封按官方注明补 event/client_key/from_user_id/to_user_id，
 *  身份取值随 content.user_infos 官方序） */
const goldenDyLeadsPhoneCard: WirePayload = {
  event: "im_receive_msg",
  client_key: "asdfavetgbvasf",
  from_user_id: "3af6e6e5-6dca-5812-86c4-413fa2440ea2",
  to_user_id: "2d3201d1-4cf2-4f01-8368-b6f2fb04ac7d",
  content: {
    conversation_short_id:
      "@9VwDhOCRTcMhM22uc8ptWc791mzgO/mKM5xwrQmjL1AVafT460zdRmYqig357zEBh7/PnNH674GEk3Xg4tuf3e==",
    server_message_id:
      "@9VwDhOCRTcMhM22uc8ptWc790GDoPvCBPpB5oA6lKFEXaPD960zdRmYqig357zEBaz9O5wCBmBjy0YTazvfVqg==",
    conversation_type: 1,
    create_time: 1758193500753,
    message_type: "leads_phone_card",
    source: "",
    im_mode: "Unset",
    leads_phone_card:
      '{"title":"我","button_text":"立即预约","bottom_text":"提交即发送抖音绑定手机号"}',
    user_infos: [
      {
        open_id: "3af6e6e5-6dca-5812-86c4-413fa2440ea2",
        nick_name: "蓝v婚庆113",
        avatar:
          "https://p3.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_c001_oQAAAr7YXqzIfCrA4ABF1EarNjvei9igAj2AKS.jpeg?from=3782654143",
      },
      {
        open_id: "2d3201d1-4cf2-4f01-8368-b6f2fb04ac7d",
        nick_name: "at2201",
        avatar:
          "https://p11.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_86e8d1ef074079d967ae2833c0d8772e.jpeg?from=3782654143",
      },
    ],
    group_info: {},
    index: 1672502400690000,
  },
};

/** im_send_msg 文本：官方未给独立样本，content 按 §5.10 黄金样本同构、事件名换 im_send_msg */
const goldenDySendText: WirePayload = {
  ...goldenDyText,
  event: "im_send_msg",
};

/** 官方黄金样本 §5.11：im_enter_direct_msg（content 为 json 字符串，逐字） */
const goldenDyEnter: WirePayload = {
  event: "im_enter_direct_msg",
  client_key: "aaaoqobz68a71u1",
  from_user_id: "aaa-8a0b-4c0f-b04f-feba0e909113",
  to_user_id: "aaa-81ec-424c-b738-8693eeaf53ea",
  content:
    '{"conversation_short_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAOJNyrA+nLFAba/f760zdRmYqig357zEBFWIIcsZD6/UJHKbF2JNw4w==","server_message_id":"@9Vxc1/yDU8sqaS+gN4koEc7912foPPyAPZd5qgKuL1UVbfj460zdRmYqig357zEBi2hwzcxjeRsR2HorFuOHvA==","conversation_type":1,"create_time":1681303286088,"scene_type":4,"user_infos":[{"open_id":"xxxx8a0b-4c0f-b04f-feba0e909113","nick_name":"Hs姝羽","avatar":"https://p6.douyinpic.com/aweme/720x720/xxxx/tos-cn-i-0813_f2c60a21b05d43e68dd6daffd7d5d733.jpeg?from=3782654143"},{"open_id":"xxxx-81ec-424c-b738-8693eeaf53ea","nick_name":"广汽传祺张掖华逸店","avatar":"https://p6.douyinpic.com/aweme/720x720/aweme-avatar/tos-cn-i-0813_5d0c96b34bcc4068bb6f9f43b609448a.jpeg?from=3782654143"}],"data-im-extra":"123456789","query":"cptName=button","path":"page/componentTpl/componentTpl"}',
};

/** 官方黄金样本 §5.12：im_recall_msg（逐字，含官方掩码星号与独有 msg_id 字段） */
const goldenDyRecall: WirePayload = {
  event: "im_recall_msg",
  client_key: "tt5daf***",
  from_user_id: "236ed9d9-2cb3-4d2f-a834-***",
  to_user_id: "971d8bed-40b6-417e-a88a-***",
  content: '{"server_message_id":"@9VwNxuKKBZ03MXG7M8ooWM791mzu***"}',
  log_id: "02172241112209700000000000000000000ffff0a94***",
  msg_id: "3292f6c3e9fba93e0255fdf12558b0224ca64cbf8d489070857c99***",
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

export const DOUYIN_IM_SCHEMAS = [
  defineSchema(DOUYIN_DEFINITIONS, "dy-text", {
    eventName: "im_receive_msg",
    name: "接收私信 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyText,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-image", {
    eventName: "im_receive_msg",
    name: "接收私信 · 图片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyImage,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-emoji", {
    eventName: "im_receive_msg",
    name: "接收私信 · 表情",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEmoji,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-video", {
    eventName: "im_receive_msg",
    name: "接收私信 · 视频分享",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: [
      ...dyMessageIdGenerations(),
      { path: "content.item_id", kind: "encryptedId" },
    ],
    payload: goldenDyVideo,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-local-image", {
    eventName: "im_receive_msg",
    name: "接收私信 · 本地图片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyLocalImage,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-retain-card", {
    eventName: "im_receive_msg",
    name: "接收私信 · 留资卡片",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyRetainCard,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-leads-phone-card", {
    eventName: "im_receive_msg",
    name: "接收私信 · 电话卡片（线索）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyLeadsPhoneCard,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-send-text", {
    eventName: "im_send_msg",
    name: "发送私信 · 文本",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDySendText,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-enter", {
    eventName: "im_enter_direct_msg",
    name: "进入私信会话",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: dyMessageIdGenerations(),
    payload: goldenDyEnter,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-recall", {
    eventName: "im_recall_msg",
    name: "撤回私信",
    kind: "event",
    contentString: true,
    wire: "json",
    expected: DOP_EXPECTED,
    idGenerations: [
      ...dyEnvelopeIdGenerations(),
      { path: "msg_id", kind: "logId" },
      { path: "content.server_message_id", kind: "encryptedId" },
    ],
    payload: goldenDyRecall,
  }),
  defineSchema(DOUYIN_DEFINITIONS, "dy-read", {
    eventName: "im_message_read",
    name: "私信已读",
    kind: "event",
    contentString: false,
    wire: "json",
    expected: DOP_EXPECTED,
    // 已读事件无 user_infos，身份组由发送者与已读用户构成（字段集见描述文件）
    idGenerations: [
      ...dyEnvelopeIdGenerations(),
      { path: "content.conversation_short_id", kind: "encryptedId" },
      { path: "content.create_time", kind: "createTimeMs" },
      { path: "content.read_open_id", kind: "openId", sameAs: "to_user_id" },
    ],
    payload: goldenDyRead,
  }),
] as const;
