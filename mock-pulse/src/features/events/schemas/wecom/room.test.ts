import { describe, expect, it } from "vitest";

import { schemaById } from "../registry";
import { WECOM_AGENT_ROOM_EVENT_SCHEMAS } from "./room";

describe("企微事件字典 · 会议室预定", () => {
  it("提供预定/取消两个模板", () => {
    expect(WECOM_AGENT_ROOM_EVENT_SCHEMAS.map((schema) => schema.id)).toEqual([
      "wc-book-meeting-room",
      "wc-cancel-meeting-room",
    ]);
  });

  it("book_meeting_room 逐字复刻官方 95333 样本（BookingId 值内行尾空格照抄）", () => {
    const schema = schemaById("wc-book-meeting-room");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "book_meeting_room",
      MeetingRoomId: "1",
      BookingId: "bkebsada6e027c123cbafAAA ",
    });
    expect(schema.xmlLayout).toEqual({
      indent: "\t",
      bareTags: ["CreateTime", "MeetingRoomId"],
    });
    expect(schema.payload.AgentID).toBeUndefined();
  });

  it("cancel_meeting_room 按同域字段表构造（MeetingRoomId/BookingId）", () => {
    const schema = schemaById("wc-cancel-meeting-room");
    expect(schema.payload).toEqual({
      ToUserName: "toUser",
      FromUserName: "fromUser",
      CreateTime: "1348831860",
      MsgType: "event",
      Event: "cancel_meeting_room",
      MeetingRoomId: "1",
      BookingId: "BOOKINGID",
    });
  });
});
