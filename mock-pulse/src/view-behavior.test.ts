import { configureStore } from "@reduxjs/toolkit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  connectionsReducer,
  defaultDouyinConnection,
  setConnectionDraft,
} from "@/features/connections";
import * as connectionsApi from "@/features/connections/api";
import {
  definitionsReducer,
  discardDraft,
  eventsReducer,
  setDraftName,
  startDraft,
} from "@/features/events";
import type { AppDispatch, RootState } from "@/store";
import { appReducer, type ViewId } from "@/stores/app-slice";
import { resolveViewEntry, VIEW_ENTRIES } from "./view-behavior";

vi.mock("@/features/connections/api", () => ({
  loadConnections: vi.fn(),
  saveConnection: vi.fn(),
  testConnectionInvoke: vi.fn(),
}));

const apiMock = vi.mocked(connectionsApi, true);

function makeStore() {
  return configureStore({
    reducer: {
      app: appReducer,
      connections: connectionsReducer,
      events: eventsReducer,
      definitions: definitionsReducer,
    },
  });
}

describe("视图行为注册表（view-behavior）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("元数据注册表全量补齐行为位；仅 runs 无草稿名", () => {
    expect(VIEW_ENTRIES.map((entry) => entry.id)).toEqual([
      "events",
      "scenarios",
      "plans",
      "runs",
      "connections",
    ]);
    for (const entry of VIEW_ENTRIES) {
      expect(typeof entry.behavior.isDirty).toBe("function");
      expect(typeof entry.behavior.save).toBe("function");
      expect(typeof entry.behavior.discard).toBe("function");
      // 只有三个带草稿的视图有草稿名位；runs/connections 回退「平台连接」
      expect(entry.behavior.draftName !== undefined).toBe(
        ["events", "scenarios", "plans"].includes(entry.id),
      );
    }
  });

  it("resolveViewEntry 必命中，未知视图报错", () => {
    expect(resolveViewEntry("runs").name).toBe("运行记录");
    expect(() => resolveViewEntry("settings" as ViewId)).toThrow("视图未注册");
  });

  it("events：草稿名跟随草稿，编辑即脏，放弃后回空", () => {
    const store = makeStore();
    const behavior = resolveViewEntry("events").behavior;
    const root = () => store.getState() as RootState;
    expect(behavior.draftName?.(root())).toBeNull();
    expect(behavior.isDirty(root())).toBe(false);

    store.dispatch(startDraft({ name: "新客问价", schemaId: "dy-text" }));
    expect(behavior.draftName?.(root())).toBe("新客问价");
    // 未动手不算脏：点模板即脏曾误拦切换（DraftGuard 误报）
    expect(behavior.isDirty(root())).toBe(false);

    store.dispatch(setDraftName("新客问价·改"));
    expect(behavior.isDirty(root())).toBe(true);

    store.dispatch(discardDraft());
    expect(behavior.draftName?.(root())).toBeNull();
    expect(behavior.isDirty(root())).toBe(false);
  });

  it("connections：深比较判定脏；无草稿保存直通；有草稿走 api 并清草稿", async () => {
    const store = makeStore();
    const behavior = resolveViewEntry("connections").behavior;
    const dispatch = store.dispatch as AppDispatch;
    const root = () => store.getState() as RootState;
    expect(behavior.isDirty(root())).toBe(false);
    await behavior.save(root(), dispatch);
    expect(apiMock.saveConnection).not.toHaveBeenCalled();

    const draft = { ...defaultDouyinConnection, clientKey: "k1" };
    store.dispatch(setConnectionDraft(draft));
    expect(behavior.isDirty(root())).toBe(true);

    apiMock.saveConnection.mockImplementation(async (config) => [config]);
    await behavior.save(root(), dispatch);
    expect(apiMock.saveConnection).toHaveBeenCalledWith(draft);
    expect(root().connections.drafts?.douyin).toBeUndefined();
    expect(behavior.isDirty(root())).toBe(false);
  });

  it("connections：放弃清掉当前渠道草稿", () => {
    const store = makeStore();
    const behavior = resolveViewEntry("connections").behavior;
    const dispatch = store.dispatch as AppDispatch;
    store.dispatch(
      setConnectionDraft({ ...defaultDouyinConnection, clientKey: "k2" }),
    );
    behavior.discard(store.getState() as RootState, dispatch);
    expect(store.getState().connections.drafts?.douyin).toBeUndefined();
  });

  it("runs：恒不脏，保存/放弃为空操作", async () => {
    const store = makeStore();
    const behavior = resolveViewEntry("runs").behavior;
    const root = store.getState() as RootState;
    expect(behavior.isDirty(root)).toBe(false);
    await expect(
      behavior.save(root, store.dispatch as AppDispatch),
    ).resolves.toBeUndefined();
    expect(
      behavior.discard(root, store.dispatch as AppDispatch),
    ).toBeUndefined();
  });
});
