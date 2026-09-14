import { defineSchema } from "../define";
import type { WirePayload, XmlLayout } from "../types";
import {
  WECOM_DEFINITIONS,
  WECOM_EXPECTED,
  wcEventIdGenerations,
} from "./shared";

/**
 * 企微事件字典 · 会议室预定（事实库 §2.11，95333）：
 * book_meeting_room 逐字复刻官方样本（FromUserName 为预定成员 fromUser，
 * BookingId 值内行尾空格系官方原文照抄）；cancel_meeting_room 按 §2.11
 * 字段表（MeetingRoomId、BookingId）同形构造。均不携带 AgentID。
 */

/** 官方黄金样本 §5.8：会议室预定（逐字；BookingId 值内行尾空格为官方原文） */
const goldenWcBookMeetingRoom: WirePayload = {
  ToUserName: "toUser",
  FromUserName: "fromUser",
  CreateTime: "1348831860",
  MsgType: "event",
  Event: "book_meeting_room",
  MeetingRoomId: "1",
  BookingId: "bkebsada6e027c123cbafAAA ",
};

/** 会议室事件排版：95333 官方样本（MeetingRoomId 数值裸文本，无行尾空格） */
const wcMeetingRoomLayout: XmlLayout = {
  indent: "\t",
  bareTags: ["CreateTime", "MeetingRoomId"],
};

export const WECOM_AGENT_ROOM_EVENT_SCHEMAS = [
  defineSchema(WECOM_DEFINITIONS, "wc-book-meeting-room", {
    eventName: "book_meeting_room",
    name: "会议室 · 预定",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMeetingRoomLayout,
    idGenerations: wcEventIdGenerations(),
    payload: goldenWcBookMeetingRoom,
  }),
  defineSchema(WECOM_DEFINITIONS, "wc-cancel-meeting-room", {
    eventName: "cancel_meeting_room",
    name: "会议室 · 取消预定",
    kind: "event",
    contentString: false,
    wire: "xml",
    expected: WECOM_EXPECTED,
    xmlLayout: wcMeetingRoomLayout,
    idGenerations: wcEventIdGenerations(),
    payload: {
      ...goldenWcBookMeetingRoom,
      Event: "cancel_meeting_room",
      BookingId: "BOOKINGID",
    },
  }),
] as const;
