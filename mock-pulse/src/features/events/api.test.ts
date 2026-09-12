import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { deleteEventById, loadEvents, saveEvent } from "./api";
import type { EventItem } from "./model";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

const event: EventItem = {
  id: "evt-001",
  name: "新客问价",
  channelId: "douyin",
  schemaId: "dy-text",
  versions: [
    {
      revision: 1,
      savedAt: "2026-09-12T01:00:00.000Z",
      payload: {
        event: "im_receive_msg",
        from_user_id: "ac6479a5-d7a6-4018-84be-c29bfc00000",
        custom_unknown: "keep-me",
        content: { text: "你好" },
      },
      expected: { status: 200, body: "" },
    },
  ],
};

describe("events api 契约", () => {
  it("loadEvents 调用 events_load 命令", async () => {
    invokeMock.mockResolvedValueOnce([event]);
    await expect(loadEvents()).resolves.toEqual([event]);
    expect(invokeMock).toHaveBeenCalledWith("events_load");
  });

  it("saveEvent 调用 events_save 并透传 camelCase 事件（含未知字段）", async () => {
    invokeMock.mockResolvedValueOnce([event]);
    await saveEvent(event);
    expect(invokeMock).toHaveBeenCalledWith("events_save", { event });
  });

  it("deleteEventById 调用 events_delete 并透传 eventId", async () => {
    invokeMock.mockResolvedValueOnce([]);
    await expect(deleteEventById("evt-001")).resolves.toEqual([]);
    expect(invokeMock).toHaveBeenCalledWith("events_delete", {
      eventId: "evt-001",
    });
  });
});
