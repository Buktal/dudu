import { defineSchema } from "../define";
import type { WirePayload } from "../types";
import { JD_DEFINITIONS, JD_EXPECTED } from "./shared";

/**
 * 咚咚客服两模板（事实库 §2.4/§5.3 官方实锤逐字）：
 * - chat_message4.2（jd-dd-chat-message）：咚咚消息协议「聊天消息格式」标题
 *   实锤，载荷即官方唯一抓到的协议体片段逐字——voice 片段（type/url 两字段，
 *   值含官方占位符原文与前置空格）；协议正文待核验(09-27)，text/image/order
 *   等其余类型未知
 * - josChatMessage.push2（jd-dd-push2）：jingdong.dongdong.packet.josChat
 *   Message.push2「发送咚咚消息」应用级参数表五参数逐字（buId/operatePin/
 *   operateNick/serviceId/orderId）；完整请求/响应体待核验(09-27)，
 *   operatePin 样本值 testPin 即官方原文
 */

/** 官方协议体 voice 片段逐字（§2.4，值含前置空格——官方文档原文如此） */
const GOLDEN_CHAT_MESSAGE: WirePayload = {
  type: " voice",
  url: " 上传京东云文件地址url（字符型，必须。声音文件京东CDN下载地址）",
};

/** push2 应用级参数表五参数（§5.3 逐字；官方未给样本值处取联调示例值） */
const GOLDEN_PUSH2: WirePayload = {
  buId: "123456",
  operatePin: "testPin",
  operateNick: "测试客服",
  serviceId: "1001",
  orderId: "123456789",
};

export const JD_DONGDONG_SCHEMAS = [
  defineSchema(JD_DEFINITIONS, "jd-dd-chat-message", {
    eventName: "chat_message4.2",
    name: "咚咚聊天消息（chat_message4.2）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: JD_EXPECTED,
    idGenerations: [],
    payload: GOLDEN_CHAT_MESSAGE,
  }),
  defineSchema(JD_DEFINITIONS, "jd-dd-push2", {
    eventName: "jingdong.dongdong.packet.josChatMessage.push2",
    name: "咚咚发送消息（josChatMessage.push2）",
    kind: "message",
    contentString: false,
    wire: "json",
    expected: JD_EXPECTED,
    idGenerations: [
      { path: "serviceId", kind: "jdBizId" },
      { path: "orderId", kind: "jdBizId" },
    ],
    payload: GOLDEN_PUSH2,
  }),
] as const;
