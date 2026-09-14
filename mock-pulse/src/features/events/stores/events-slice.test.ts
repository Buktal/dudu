import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import * as api from "../api";
import { resolveEditorFields } from "../definitions/resolve";
import type { EventItem } from "../model";
import { getAt, wireDraftText } from "../payload";
import { schemaById } from "../schemas";
import {
  selectDraft,
  selectDraftChannelId,
  selectEvents,
  selectFieldDefinitions,
  selectFilters,
  selectPage,
  selectSchemaUserDefinition,
} from "../selectors";
import {
  applyFieldDefinitions,
  deleteEvent,
  duplicateCurrentDraft,
  editFieldText,
  eventsReducer,
  fetchEvents,
  fetchFieldDefinitions,
  renameEvent,
  resolveCurrentDraft,
  saveEvent,
  saveEventAs,
  selectDraftDirty,
  setDraftExpected,
  setDraftField,
  setDraftName,
  setDraftRawText,
  setFilters,
  setPage,
  startDraft,
  toggleEventFavorite,
  toggleSenderSync,
} from "./events-slice";

vi.mock("../api", () => ({
  loadEvents: vi.fn(),
  saveEvent: vi.fn(),
  deleteEventById: vi.fn(),
  loadDefinitions: vi.fn(),
  saveDefinition: vi.fn(),
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

describe("字段说明：用户定义装载与应用（#22）", () => {
  it("初始无定义；装载后 loaded 置位，bySchemaId 为空文档", async () => {
    const store = makeStore();
    expect(selectFieldDefinitions(store.getState().events)).toEqual({
      loaded: false,
      bySchemaId: {},
    });

    apiMock.loadDefinitions.mockResolvedValue({ schemas: {} });
    await store.dispatch(fetchFieldDefinitions());
    expect(selectFieldDefinitions(store.getState().events)).toEqual({
      loaded: true,
      bySchemaId: {},
    });
  });

  it("应用说明按 schemaId 落库，未知字段补录后转正为正常表单字段", async () => {
    const store = makeStore();
    apiMock.saveDefinition.mockImplementation(
      async (schemaId: string, definition: api.StoredSchemaDefinition) => ({
        schemas: { [schemaId]: definition },
      }),
    );

    // 草稿里先有一个未知字段：此时还是「待补充说明」的未知回退
    store.dispatch(startDraft({ name: "带未知字段", schemaId: "dy-text" }));
    store.dispatch(setDraftField({ path: "content.guest_id", value: "g-001" }));
    const before = resolveEditorFields(
      schemaById("dy-text"),
      selectSchemaUserDefinition(store.getState().events, "dy-text")?.fields,
      selectDraft(store.getState().events)?.payload ?? {},
    );
    expect(
      before.find((field) => field.path === "content.guest_id"),
    ).toMatchObject({ unknown: true, group: "其他参数" });

    // 字典「应用说明」：把补录说明写成用户定义
    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.guest_id",
            title: "访客 ID",
            type: "string",
            group: "用户与身份",
            description: "补录的第三方访客标识。",
            required: true,
          },
        ],
      }),
    );

    const userDef = selectSchemaUserDefinition(
      store.getState().events,
      "dy-text",
    );
    expect(userDef).toMatchObject({ schemaId: "dy-text", version: "2026.09" });

    // 定义应用后表单元数据即时生效：不再是 unknown、按其分组归位、显示自定义标题
    const after = resolveEditorFields(
      schemaById("dy-text"),
      selectSchemaUserDefinition(store.getState().events, "dy-text")?.fields,
      selectDraft(store.getState().events)?.payload ?? {},
    );
    const promoted = after.find((field) => field.path === "content.guest_id");
    expect(promoted).toMatchObject({
      title: "访客 ID",
      group: "用户与身份",
      description: "补录的第三方访客标识。",
      unknown: false,
      value: "g-001",
    });
  });

  it("再次应用说明按 schemaId 整体覆写旧定义", async () => {
    const store = makeStore();
    let saved: api.DefinitionsDoc = { schemas: {} };
    apiMock.saveDefinition.mockImplementation(
      async (schemaId: string, definition: api.StoredSchemaDefinition) => {
        saved = { schemas: { ...saved.schemas, [schemaId]: definition } };
        return saved;
      },
    );

    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.text",
            title: "旧标题",
            type: "string",
            group: "消息内容",
            description: "旧说明。",
          },
        ],
      }),
    );
    await store.dispatch(
      applyFieldDefinitions({
        schemaId: "dy-text",
        version: "2026.09",
        fields: [
          {
            path: "content.text",
            title: "新标题",
            type: "string",
            group: "消息内容",
            description: "新说明。",
          },
        ],
      }),
    );
    const fields = selectSchemaUserDefinition(
      store.getState().events,
      "dy-text",
    )?.fields;
    expect(fields).toHaveLength(1);
    expect(fields?.[0]).toMatchObject({ title: "新标题" });
  });
});

describe("selectDraftChannelId（跨 feature 窄 selector）", () => {
  it("按草稿渠道返回（抖音/企微），无草稿为 undefined；兼容 RootState 形状", () => {
    const store = makeStore();
    expect(selectDraftChannelId(store.getState())).toBeUndefined();

    store.dispatch(startDraft({ name: "企微文本", schemaId: "wc-text" }));
    expect(selectDraftChannelId(store.getState())).toBe("wecom");
    // 子状态形态同样可用
    expect(selectDraftChannelId(store.getState().events)).toBe("wecom");

    store.dispatch(startDraft({ name: "抖音文本", schemaId: "dy-text" }));
    expect(selectDraftChannelId(store.getState())).toBe("douyin");
  });
});

describe("可见草稿与异步保存回归", () => {
  it("格式化后修改表单，保存与复制使用最新字段并保留收藏", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "原文往返", schemaId: "dy-text" }));
    const original = store.getState().events.draft;
    if (!original) throw new Error("新建草稿失败");
    store.dispatch(
      setDraftRawText(
        wireDraftText(schemaById(original.schemaId), original.payload),
      ),
    );
    store.dispatch(
      setDraftField({ path: "content.text", value: "表单里的最新消息" }),
    );
    store.dispatch(toggleEventFavorite());
    expect(selectDraftDirty(store.getState().events)).toBe(true);
    expect(
      getAt(
        resolveCurrentDraft(store.getState().events)?.payload,
        "content.text",
      ),
    ).toBe("表单里的最新消息");
    apiMock.saveEvent.mockImplementationOnce(async (event) => [event]);
    await store.dispatch(saveEvent()).unwrap();
    const saved = store.getState().events.items[0];
    expect(
      getAt(saved.versions[saved.versions.length - 1]?.payload, "content.text"),
    ).toBe("表单里的最新消息");
    expect(saved.favorite).toBe(true);
    store.dispatch(duplicateCurrentDraft());
    expect(getAt(store.getState().events.draft?.payload, "content.text")).toBe(
      "表单里的最新消息",
    );
  });

  it("非法 JSON 字段和非法完整报文均阻止保存旧值", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "无效字段", schemaId: "dy-text" }));
    store.dispatch(
      editFieldText({ path: "content.custom", type: "json", text: "{" }),
    );
    await expect(store.dispatch(saveEvent()).unwrap()).rejects.toMatchObject({
      message: expect.stringContaining("请先修正参数"),
    });
    store.dispatch(startDraft({ name: "无效报文", schemaId: "dy-text" }));
    store.dispatch(setDraftRawText("{"));
    await expect(store.dispatch(saveEvent()).unwrap()).rejects.toBeDefined();
    expect(apiMock.saveEvent).not.toHaveBeenCalled();
  });

  it("删除其他事件不清空新草稿与其完整报文", () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "未保存", schemaId: "dy-text" }));
    store.dispatch(setDraftRawText("{未完成"));
    const before = store.getState().events.draft;
    store.dispatch(deleteEvent.fulfilled([], "delete-request", "old-event"));
    expect(store.getState().events.draft).toEqual(before);
    expect(store.getState().events.rawText).toBe("{未完成");
  });

  it("另存为回包不覆盖后来新建的草稿", async () => {
    const store = makeStore();
    store.dispatch(startDraft({ name: "A", schemaId: "dy-text" }));
    let finish!: (events: EventItem[]) => void;
    let copy!: EventItem;
    apiMock.saveEvent.mockImplementationOnce((event) => {
      copy = event;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = store.dispatch(saveEventAs("副本 A"));
    store.dispatch(startDraft({ name: "新草稿 B", schemaId: "wc-text" }));
    finish([copy]);
    await pending;
    expect(store.getState().events.draft?.name).toBe("新草稿 B");
    expect(store.getState().events.draft?.schemaId).toBe("wc-text");
  });
});
