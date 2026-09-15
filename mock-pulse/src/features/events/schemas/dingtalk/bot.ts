import { defineSchema } from "../define";
import type { IdGeneration, WirePayload } from "../types";
import { DINGTALK_BOT_EXPECTED, DINGTALK_DEFINITIONS } from "./shared";

/**
 * 钉钉机器人收消息（事实库 §5.1 全量样本 + 同页 6 msgtype 片段，逐字）：
 * 明文 JSON 通道（HTTP 模式，与事件密文信封互不相干），验签靠 HTTP 头
 * timestamp/sign = Base64(HmacSHA256(timestamp+"\n"+appSecret))（1h 时钟窗，
 * 由 Rust 适配器完成）。text 模板为官方全量黄金样本；其余 5 个 msgtype 的
 * 信封字段取同一样本（逐字），msgtype 专属字段取官方片段（逐字）——媒体
 * 消息不直接给二进制，给 downloadCode。
 */

/** 官方黄金样本 §5.1：机器人收文本消息全量信封（text/robotCode/msgtype 之前，逐字） */
const GOLDEN_BOT_ENVELOPE: WirePayload = {
  senderPlatform: "Mac",
  conversationId: "cid6EUvB2O8qVF2RYQtHTKEsg==",
  atUsers: [
    {
      dingtalkId: "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5",
    },
  ],
  chatbotCorpId: "ding9733d095*******6cb783455b",
  chatbotUserId: "$:LWCP_v1:$PcdFk0c1XakTWLPSQCaVcRzxeEVV3pr5",
  msgId: "msgrK2ckHkMbaiUWt5xQU+riw==",
  senderNick: "小钉",
  isAdmin: true,
  senderStaffId: "014728255240768602",
  sessionWebhookExpiredTime: 1708332604316,
  createAt: 1708327204136,
  senderCorpId: "ding9733d095*******6cb783455b",
  conversationType: "2",
  senderId: "$:LWCP_v1:$6GYsn+zrv5WZ77xc2v4zsyXfBv1MhAv9",
  conversationTitle: "测试群",
  isInAtList: true,
  sessionWebhook:
    "https://oapi.dingtalk.com/robot/sendBySession?session=66d7c695a9e1f18782a7cba1d9deb885",
};

/** 官方黄金样本 §5.1 尾段：text + robotCode + msgtype（逐字，键序随原文） */
const GOLDEN_TEXT_TAIL: WirePayload = {
  text: {
    content: " text",
  },
  robotCode: "dingohropvkloy0xdm3k",
  msgtype: "text",
};

/** 机器人消息的 ID 生成规则：msgId（msgr…== base64 形态）+ 双毫秒时刻 */
function botIdGenerations(): IdGeneration[] {
  return [
    { path: "msgId", kind: "dingtalkMsgId" },
    { path: "createAt", kind: "createTimeMs" },
    { path: "sessionWebhookExpiredTime", kind: "createTimeMs" },
  ];
}

/** 非文本 msgtype 模板：官方样本信封 + 官方 msgtype 片段（content 顶替 text 位） */
function botMessage(
  tail: Pick<WirePayload, "content" | "robotCode" | "msgtype">,
): WirePayload {
  return { ...GOLDEN_BOT_ENVELOPE, ...tail };
}

export const DINGTALK_BOT_SCHEMAS = [
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-text", {
    eventName: "text",
    name: "机器人收文本消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: { ...GOLDEN_BOT_ENVELOPE, ...GOLDEN_TEXT_TAIL },
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-picture", {
    // 官方片段（§5.1 同页逐字）：{"msgtype":"picture","content":{"downloadCode":"mIofN681YE3f/…"}}
    eventName: "picture",
    name: "机器人收图片消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: botMessage({
      content: { downloadCode: "mIofN681YE3f/…" },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "picture",
    }),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-audio", {
    // 官方片段（逐字）：{"msgtype":"audio","content":{"duration":4000,"downloadCode":"mIofN…","recognition":"钉钉，让进步发生"}}
    eventName: "audio",
    name: "机器人收语音消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: botMessage({
      content: {
        duration: 4000,
        downloadCode: "mIofN…",
        recognition: "钉钉，让进步发生",
      },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "audio",
    }),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-video", {
    // 官方片段（逐字）：{"msgtype":"video","content":{"duration":4000,"downloadCode":"mIofN…","videoType":"mp4"}}
    eventName: "video",
    name: "机器人收视频消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: botMessage({
      content: {
        duration: 4000,
        downloadCode: "mIofN…",
        videoType: "mp4",
      },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "video",
    }),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-file", {
    // 官方片段（逐字）：{"msgtype":"file","content":{"downloadCode":"mIofN…","fileName":"钉钉让进步发生.pdf"}}
    eventName: "file",
    name: "机器人收文件消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: botMessage({
      content: {
        downloadCode: "mIofN…",
        fileName: "钉钉让进步发生.pdf",
      },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "file",
    }),
  }),
  defineSchema(DINGTALK_DEFINITIONS, "dt-bot-richtext", {
    // 官方片段（逐字）：{"msgtype":"richText","content":{"richText":[{"text":"你好"},{"downloadCode":"mIofN…","type":"picture"}]}}
    eventName: "richText",
    name: "机器人收富文本消息",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: DINGTALK_BOT_EXPECTED,
    idGenerations: botIdGenerations(),
    payload: botMessage({
      content: {
        richText: [
          { text: "你好" },
          { downloadCode: "mIofN…", type: "picture" },
        ],
      },
      robotCode: "dingohropvkloy0xdm3k",
      msgtype: "richText",
    }),
  }),
] as const;
