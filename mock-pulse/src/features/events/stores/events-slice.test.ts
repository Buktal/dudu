import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api";
import type { EventItem } from "../model";
import { getAt } from "../payload";
import {
  deleteEvent,
  eventsReducer,
  fetchEvents,
  renameEvent,
  saveEvent,
  selectDraft,
  selectEvents,
  selectFilters,
  selectPage,
  setDraftExpected,
  setDraftField,
  setDraftName,
  setFilters,
  setPage,
  startDraft,
  toggleSenderSync,
} from "./events-slice";

vi.mock("../api", () => ({
  loadEvents: vi.fn(),
  saveEvent: vi.fn(),
  deleteEventById: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

function makeStore() {
  return configureStore({ reducer: { events: eventsReducer } });
}

const contentOf = (item: EventItem) =>
  item.versions[item.versions.length - 1].payload.content as Record<
    string,
    unknown
  >;

describe("events slice 版本化状态流转", () => {
  it("模板新建→编辑→保存→素材库可见→再编辑→保存出新版本，旧版本不变", async () => {
    const store = makeStore();
    apiMock.saveEvent.mockImplementation(async (event: EventItem) => [event]);

    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));
    let draft = selectDraft(store.getState().events);
    expect(draft?.name).toBe("新客问价");
    expect(selectEvents(store.getState().events)).toEqual([]);

    store.dispatch(setDraftField({ path: "content.text", value: "第一句" }));
    await store.dispatch(saveEvent());
    let items = selectEvents(store.getState().events);
    expect(items).toHaveLength(1);
    expect(contentOf(items[0]).text).toBe("第一句");
    expect(items[0].versions).toHaveLength(1);

    store.dispatch(setDraftField({ path: "content.text", value: "第二句" }));
    await store.dispatch(saveEvent());
    items = selectEvents(store.getState().events);
    expect(items[0].versions).toHaveLength(2);
    expect(contentOf(items[0]).text).toBe("第二句");
    // 旧版本内容不变
    expect(
      (items[0].versions[0].payload.content as Record<string, unknown>).text,
    ).toBe("第一句");
    // 保存后草稿与最新版本一致
    draft = selectDraft(store.getState().events);
    expect(draft).not.toBeNull();
    expect(
      ((draft?.payload.content ?? {}) as Record<string, unknown>).text,
    ).toBe("第二句");
  });

  it("保存时未知字段随版本持久化，重新装载不丢失", async () => {
    const store = makeStore();
    let persisted: EventItem[] = [];
    apiMock.saveEvent.mockImplementation(async (event: EventItem) => {
      persisted = [event];
      return persisted;
    });
    apiMock.loadEvents.mockResolvedValue([]);

    store.dispatch(startDraft({ name: "带未知字段", schemaId: "dy-text" }));
    store.dispatch(setDraftField({ path: "content.guest_id", value: "g-001" }));
    store.dispatch(
      setDraftField({ path: "unknown_top", value: { keep: [1, 2] } }),
    );
    await store.dispatch(saveEvent());
    expect(contentOf(persisted[0]).guest_id).toBe("g-001");
    expect(persisted[0].versions[0].payload.unknown_top).toEqual({
      keep: [1, 2],
    });

    // 模拟重启：从持久层拉回再装载
    apiMock.loadEvents.mockResolvedValue(persisted);
    await store.dispatch(fetchEvents());
    const reloaded = selectEvents(store.getState().events)[0];
    expect(contentOf(reloaded).guest_id).toBe("g-001");
  });

  it("发送者 ID 同步开关：开启即对齐，跟随编辑；关闭后独立", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "同步验证", schemaId: "dy-text" }));
    const before = getAt(
      selectDraft(store.getState().events)?.payload,
      "content.user_infos[0].open_id",
    );

    store.dispatch(setDraftField({ path: "from_user_id", value: "first-id" }));
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.user_infos[0].open_id",
      ),
    ).toBe(before); // 未开同步：资料 ID 不动

    store.dispatch(toggleSenderSync());
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.user_infos[0].open_id",
      ),
    ).toBe("first-id"); // 开启即显式同步

    store.dispatch(setDraftField({ path: "from_user_id", value: "second-id" }));
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.user_infos[0].open_id",
      ),
    ).toBe("second-id"); // 跟随编辑

    store.dispatch(toggleSenderSync());
    store.dispatch(setDraftField({ path: "from_user_id", value: "third-id" }));
    expect(
      getAt(
        selectDraft(store.getState().events)?.payload,
        "content.user_infos[0].open_id",
      ),
    ).toBe("second-id"); // 关闭后独立
  });

  it("重命名走事件级更新，不追加版本", async () => {
    const store = makeStore();
    apiMock.saveEvent.mockImplementation(async (event: EventItem) => [event]);

    store.dispatch(startDraft({ name: "旧名", schemaId: "dy-read" }));
    await store.dispatch(saveEvent());
    const saved = selectEvents(store.getState().events)[0];
    expect(saved.versions).toHaveLength(1);

    await store.dispatch(renameEvent({ id: saved.id, name: "新名" }));
    const renamed = selectEvents(store.getState().events)[0];
    expect(renamed.name).toBe("新名");
    expect(renamed.versions).toHaveLength(1);
  });

  it("删除事件后从素材库移除并清理草稿", async () => {
    const store = makeStore();
    const item: EventItem = {
      id: "evt-x",
      name: "待删除",
      channelId: "douyin",
      schemaId: "dy-text",
      versions: [
        {
          revision: 1,
          savedAt: "2026-09-12T00:00:00.000Z",
          payload: { event: "im_receive_msg" },
          expected: { status: 200, body: "", bodyMode: "contains" },
        },
      ],
    };
    apiMock.loadEvents.mockResolvedValue([item]);
    apiMock.deleteEventById.mockResolvedValue([]);
    await store.dispatch(fetchEvents());
    expect(selectEvents(store.getState().events)).toHaveLength(1);

    await store.dispatch(deleteEvent(item.id));
    expect(selectEvents(store.getState().events)).toEqual([]);
    expect(selectDraft(store.getState().events)).toBeNull();
  });

  it("筛选与分页 reducer：改筛选回第 1 页，页码可翻", () => {
    const store = makeStore();
    expect(selectFilters(store.getState().events)).toEqual({
      query: "",
      channel: "all",
      kind: "all",
    });

    store.dispatch(setPage(4));
    expect(selectPage(store.getState().events)).toBe(4);

    store.dispatch(setFilters({ query: "咨询", channel: "douyin" }));
    expect(selectFilters(store.getState().events)).toEqual({
      query: "咨询",
      channel: "douyin",
      kind: "all",
    });
    expect(selectPage(store.getState().events)).toBe(1);

    store.dispatch(startDraft({ name: "草稿名", schemaId: "dy-text" }));
    store.dispatch(setDraftName("任意"));
    expect(selectDraft(store.getState().events)?.name).toBe("任意");
  });

  it("期望回执编辑：草稿上改状态/形态/正文，保存随版本落盘", async () => {
    const store = makeStore();
    apiMock.saveEvent.mockImplementation(async (event: EventItem) => [event]);

    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));
    expect(selectDraft(store.getState().events)?.expected).toEqual({
      status: 200,
      body: "",
      bodyMode: "contains",
    });

    store.dispatch(setDraftExpected({ status: 403, bodyMode: "jsonField" }));
    expect(selectDraft(store.getState().events)?.expected).toEqual({
      status: 403,
      body: "",
      bodyMode: "jsonField",
    });

    store.dispatch(setDraftExpected({ body: '{"code":0}' }));
    await store.dispatch(saveEvent());
    const saved = selectEvents(store.getState().events)[0];
    expect(saved.versions[0].expected).toEqual({
      status: 403,
      body: '{"code":0}',
      bodyMode: "jsonField",
    });
  });
});
