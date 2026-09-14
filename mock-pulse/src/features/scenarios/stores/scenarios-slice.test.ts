import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type EventItem,
  eventsReducer,
  initialEventsState,
} from "@/features/events";

import * as api from "../api";
import { isTemplateStep, type Scenario } from "../model";
import { resolveSteps } from "../selectors";
import {
  addScenarioStep,
  deleteScenario,
  discardScenarioDraft,
  fetchScenarios,
  initialScenariosState,
  moveDraftStep,
  openScenario,
  removeDraftStep,
  replaceScenarioStep,
  type ScenariosState,
  saveScenario,
  scenariosReducer,
  selectScenarioDraft,
  selectScenarioFilters,
  selectScenarioPage,
  selectScenarios,
  setDraftChannel,
  setDraftName,
  setFilters,
  setPage,
  setScenarioFailure,
  setStepWait,
  startScenarioDraft,
  syncAllScenarioSteps,
  syncScenarioStep,
  toggleScenarioFavorite,
} from "./scenarios-slice";

vi.mock("../api", () => ({
  loadScenarios: vi.fn(),
  saveScenario: vi.fn(),
  deleteScenarioById: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

function douyinEvent(revisions: number[]): EventItem {
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: revisions.map((revision) => ({
      revision,
      savedAt: `2026-09-12T0${revision}:00:00.000Z`,
      payload: {
        event: "im_receive_msg",
        content: { text: `第${revision}句` },
      },
      expected: { status: 200, body: "", bodyMode: "contains" },
    })),
  };
}

const wecomEvent: EventItem = {
  id: "evt-wc-1",
  name: "企微文本",
  channelId: "wecom",
  schemaId: "wc-text",
  versions: [
    {
      revision: 1,
      savedAt: "2026-09-12T01:00:00.000Z",
      payload: { MsgType: "text" },
      expected: { status: 200, body: "", bodyMode: "contains" },
    },
  ],
};

function makeStore(
  events: EventItem[] = [],
  scenariosOverride: Partial<ScenariosState> = {},
) {
  const preloaded = {
    scenarios: { ...initialScenariosState, ...scenariosOverride },
    events: { ...initialEventsState, items: events, loaded: true },
  };
  return configureStore({
    reducer: { scenarios: scenariosReducer, events: eventsReducer },
    preloadedState: preloaded,
  });
}

const savedDouyinScenario: Scenario = {
  id: "scn-saved",
  name: "已保存剧本",
  channelId: "douyin",
  steps: [{ eventId: "evt-dy-1", revision: 1 }],
};

/** 测试辅助：当前草稿步骤的 eventId（本文件剧本只含事件步骤处使用） */
function stepEventIds(store: { getState: () => unknown }): string[] {
  const steps = selectScenarioDraft(
    (store.getState() as { scenarios: ScenariosState }).scenarios,
  )?.steps;
  return (steps ?? []).map((step) =>
    isTemplateStep(step) ? "<template>" : step.eventId,
  );
}

/** 测试辅助：事件步骤的 revision（模板步骤无版本号语义） */
function stepRevision(step: Scenario["steps"][number] | undefined) {
  return step && !isTemplateStep(step) ? step.revision : undefined;
}

describe("剧本编辑状态流转", () => {
  it("新建先选渠道 → 添加同渠道步骤（引用最新版本）→ 保存进剧本库", async () => {
    const store = makeStore([douyinEvent([1, 2])]);
    const captured: { scenario: Scenario | null } = { scenario: null };
    apiMock.saveScenario.mockImplementation(async (scenario: Scenario) => {
      captured.scenario = scenario;
      return [scenario];
    });

    store.dispatch(
      startScenarioDraft({ name: "抖音接待", channelId: "douyin" }),
    );
    expect(selectScenarioDraft(store.getState().scenarios)?.channelId).toBe(
      "douyin",
    );
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([]);

    await store.dispatch(addScenarioStep({ eventId: "evt-dy-1" }));
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([
      { eventId: "evt-dy-1", revision: 2, wait: 0 },
    ]);

    await store.dispatch(saveScenario());
    expect(captured.scenario?.steps).toEqual([
      { eventId: "evt-dy-1", revision: 2, wait: 0 },
    ]);
    expect(selectScenarios(store.getState().scenarios)).toHaveLength(1);
  });

  it("无步骤时可换渠道；添加第一步后换渠道在领域层被拒绝", async () => {
    const store = makeStore([douyinEvent([1])]);
    store.dispatch(startScenarioDraft({ name: "先抖音", channelId: "douyin" }));
    store.dispatch(setDraftChannel("wecom"));
    expect(selectScenarioDraft(store.getState().scenarios)?.channelId).toBe(
      "wecom",
    );

    store.dispatch(startScenarioDraft({ name: "再抖音", channelId: "douyin" }));
    await store.dispatch(addScenarioStep({ eventId: "evt-dy-1" }));
    expect(() => store.dispatch(setDraftChannel("wecom"))).toThrow(
      /渠道锁定为抖音/,
    );
    expect(selectScenarioDraft(store.getState().scenarios)?.channelId).toBe(
      "douyin",
    );
  });

  it("添加他渠道事件被领域层拒绝：可读错误、草稿不变、不落盘", async () => {
    const store = makeStore([douyinEvent([1]), wecomEvent]);
    store.dispatch(
      startScenarioDraft({ name: "抖音接待", channelId: "douyin" }),
    );

    const result = store.dispatch(addScenarioStep({ eventId: "evt-wc-1" }));
    await expect(result.unwrap()).rejects.toThrow(
      /剧本渠道已锁定为抖音，不能添加企业微信的事件/,
    );
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([]);
    expect(apiMock.saveScenario).not.toHaveBeenCalled();
  });

  it("添加素材库中不存在的事件被拒绝（可读错误）", async () => {
    const store = makeStore([douyinEvent([1])]);
    store.dispatch(startScenarioDraft({ name: "空库", channelId: "douyin" }));
    await expect(
      store.dispatch(addScenarioStep({ eventId: "evt-gone" })).unwrap(),
    ).rejects.toThrow(/事件不存在：evt-gone/);
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([]);
  });

  it("保存时对走私的跨渠道步骤整体拒绝（绕过 addStep 的路径）", async () => {
    // 经 preloadedState 直接注入异常草稿（模拟绕过 addStep 的路径），保存必须守住
    const smuggled: Scenario = {
      id: "scn-smuggled",
      name: "走私",
      channelId: "douyin",
      steps: [{ eventId: "evt-wc-1", revision: 1 }],
    };
    const store = makeStore([douyinEvent([1]), wecomEvent], {
      draft: smuggled,
    });
    expect(selectScenarioDraft(store.getState().scenarios)).toEqual(smuggled);

    await expect(store.dispatch(saveScenario()).unwrap()).rejects.toThrow(
      /剧本渠道为抖音，步骤引用了企业微信的事件/,
    );
    expect(apiMock.saveScenario).not.toHaveBeenCalled();
  });

  it("引用悬空（事件已不存在）保存被拒绝", async () => {
    const dangling: Scenario = {
      id: "scn-dangling",
      name: "悬空",
      channelId: "douyin",
      steps: [{ eventId: "evt-gone", revision: 1 }],
    };
    const store = makeStore([douyinEvent([1])], { draft: dangling });
    await expect(store.dispatch(saveScenario()).unwrap()).rejects.toThrow(
      /步骤引用的事件不存在：evt-gone/,
    );
    expect(apiMock.saveScenario).not.toHaveBeenCalled();
  });
});

describe("版本引用与显式同步", () => {
  function storeWithSavedScenario(event: EventItem) {
    const store = makeStore([event]);
    apiMock.loadScenarios.mockResolvedValue([savedDouyinScenario]);
    return store;
  }

  it("事件出新版本不影响已保存剧本；打开后提示有新版本；显式同步更新引用", async () => {
    // 剧本保存时引用 v1；此后事件追加 v2
    const store = storeWithSavedScenario(douyinEvent([1, 2]));
    await store.dispatch(fetchScenarios());
    const saved = selectScenarios(store.getState().scenarios)[0];
    expect(saved.steps).toEqual([{ eventId: "evt-dy-1", revision: 1 }]);

    store.dispatch(openScenario(saved.id));
    let draft = selectScenarioDraft(store.getState().scenarios);
    expect(stepRevision(draft?.steps[0])).toBe(1);
    // 提示计算：引用 v1 落后于最新 v2
    const events = store.getState().events.items;
    expect(resolveSteps(draft?.steps ?? [], events)[0]?.outdated).toBe(true);

    // 显式同步到最新版本
    await store.dispatch(syncScenarioStep({ index: 0 }));
    draft = selectScenarioDraft(store.getState().scenarios);
    expect(stepRevision(draft?.steps[0])).toBe(2);
    expect(
      resolveSteps(draft?.steps ?? [], store.getState().events.items)[0]
        ?.outdated,
    ).toBe(false);
  });

  it("同步前引用的仍是旧版本内容（v1 文本不变）", async () => {
    const store = storeWithSavedScenario(douyinEvent([1, 2]));
    await store.dispatch(fetchScenarios());
    store.dispatch(openScenario(savedDouyinScenario.id));
    const draft = selectScenarioDraft(store.getState().scenarios);
    const row = resolveSteps(draft?.steps ?? [], store.getState().events.items);
    expect(row[0]?.referenced?.payload).toMatchObject({
      content: { text: "第1句" },
    });
  });

  it("syncAll 一次同步所有落后步骤；已是最新与悬空的行各自处理", async () => {
    const event = douyinEvent([1, 2]);
    const other = { ...event, id: "evt-dy-2", name: "进入会话" };
    const scenario: Scenario = {
      id: "scn-multi",
      name: "多步骤",
      channelId: "douyin",
      steps: [
        { eventId: "evt-dy-1", revision: 1 },
        { eventId: "evt-dy-2", revision: 2 },
      ],
    };
    const store = makeStore([event, other]);
    apiMock.loadScenarios.mockResolvedValue([scenario]);
    await store.dispatch(fetchScenarios());
    store.dispatch(openScenario(scenario.id));

    await store.dispatch(syncAllScenarioSteps());
    const draft = selectScenarioDraft(store.getState().scenarios);
    expect(draft?.steps).toEqual([
      { eventId: "evt-dy-1", revision: 2 },
      { eventId: "evt-dy-2", revision: 2 },
    ]);
  });

  it("同步悬空引用（事件已不在库）被拒绝（可读错误）", async () => {
    const store = makeStore([douyinEvent([1])]);
    apiMock.loadScenarios.mockResolvedValue([
      {
        ...savedDouyinScenario,
        steps: [{ eventId: "evt-gone", revision: 1 }],
      },
    ]);
    await store.dispatch(fetchScenarios());
    store.dispatch(openScenario(savedDouyinScenario.id));
    await expect(
      store.dispatch(syncScenarioStep({ index: 0 })).unwrap(),
    ).rejects.toThrow(/事件不存在：evt-gone/);
  });
});

describe("步骤调序 / 删除 / 重命名 / 删除剧本", () => {
  async function storeWithTwoSteps() {
    const event = douyinEvent([1]);
    const other = { ...event, id: "evt-dy-2", name: "进入会话" };
    const store = makeStore([event, other]);
    store.dispatch(startScenarioDraft({ name: "两步", channelId: "douyin" }));
    await store.dispatch(addScenarioStep({ eventId: "evt-dy-1" }));
    await store.dispatch(addScenarioStep({ eventId: "evt-dy-2" }));
    return store;
  }

  it("上移/下移调整顺序，保存后顺序入库", async () => {
    const store = await storeWithTwoSteps();
    apiMock.saveScenario.mockImplementation(async (scenario: Scenario) => [
      scenario,
    ]);

    store.dispatch(moveDraftStep({ index: 0, delta: 1 }));
    expect(stepEventIds(store)).toEqual(["evt-dy-2", "evt-dy-1"]);

    // 首步上移为无操作
    store.dispatch(moveDraftStep({ index: 0, delta: -1 }));
    expect(stepEventIds(store)).toEqual(["evt-dy-2", "evt-dy-1"]);

    await store.dispatch(saveScenario());
    expect(selectScenarios(store.getState().scenarios)[0]?.steps).toEqual([
      { eventId: "evt-dy-2", revision: 1, wait: 0.6 },
      { eventId: "evt-dy-1", revision: 1, wait: 0 },
    ]);
  });

  it("删除步骤后保存生效", async () => {
    const store = await storeWithTwoSteps();
    apiMock.saveScenario.mockImplementation(async (scenario: Scenario) => [
      scenario,
    ]);

    store.dispatch(removeDraftStep(0));
    expect(stepEventIds(store)).toEqual(["evt-dy-2"]);
    await store.dispatch(saveScenario());
    expect(selectScenarios(store.getState().scenarios)[0]?.steps).toEqual([
      { eventId: "evt-dy-2", revision: 1, wait: 0.6 },
    ]);
  });

  it("重命名（草稿改名保存）生效且步骤不变", async () => {
    const store = await storeWithTwoSteps();
    apiMock.saveScenario.mockImplementation(async (scenario: Scenario) => [
      scenario,
    ]);
    await store.dispatch(saveScenario());

    store.dispatch(setDraftName("新名字"));
    await store.dispatch(saveScenario());
    const saved = selectScenarios(store.getState().scenarios)[0];
    expect(saved?.name).toBe("新名字");
    expect(saved?.steps).toHaveLength(2);
  });

  it("删除剧本从库中移除并清理当前草稿", async () => {
    const store = makeStore([douyinEvent([1])]);
    apiMock.loadScenarios.mockResolvedValue([savedDouyinScenario]);
    apiMock.deleteScenarioById.mockResolvedValue([]);
    await store.dispatch(fetchScenarios());
    store.dispatch(openScenario(savedDouyinScenario.id));
    expect(selectScenarioDraft(store.getState().scenarios)).not.toBeNull();

    await store.dispatch(deleteScenario(savedDouyinScenario.id));
    expect(selectScenarios(store.getState().scenarios)).toEqual([]);
    expect(selectScenarioDraft(store.getState().scenarios)).toBeNull();
  });
});

describe("打开 / 放弃草稿 / 筛选分页", () => {
  it("fetchScenarios 装载列表；打开剧本装载其副本；放弃草稿恢复已保存内容", async () => {
    const store = makeStore([douyinEvent([1])]);
    apiMock.loadScenarios.mockResolvedValue([savedDouyinScenario]);
    await store.dispatch(fetchScenarios());
    expect(selectScenarios(store.getState().scenarios)).toEqual([
      savedDouyinScenario,
    ]);
    expect(selectScenarioDraft(store.getState().scenarios)).toBeNull();

    store.dispatch(openScenario(savedDouyinScenario.id));
    store.dispatch(setDraftName("改了又不要"));
    store.dispatch(discardScenarioDraft());
    expect(selectScenarioDraft(store.getState().scenarios)?.name).toBe(
      "已保存剧本",
    );
  });

  it("新建未保存时放弃草稿回到空态", async () => {
    const store = makeStore([]);
    store.dispatch(startScenarioDraft({ name: "草稿", channelId: "douyin" }));
    store.dispatch(discardScenarioDraft());
    expect(selectScenarioDraft(store.getState().scenarios)).toBeNull();
  });

  it("筛选与分页 reducer：改筛选回第 1 页，页码可翻", () => {
    const store = makeStore([]);
    expect(selectScenarioFilters(store.getState().scenarios)).toEqual({
      query: "",
      channel: "all",
    });
    store.dispatch(setPage(4));
    expect(selectScenarioPage(store.getState().scenarios)).toBe(4);
    store.dispatch(setFilters({ query: "咨询", channel: "douyin" }));
    expect(selectScenarioFilters(store.getState().scenarios)).toEqual({
      query: "咨询",
      channel: "douyin",
    });
    expect(selectScenarioPage(store.getState().scenarios)).toBe(1);
  });
});

describe("剧本编辑回归", () => {
  it("替换步骤保留等待并拒绝跨渠道，收藏和策略随保存保留", async () => {
    const next = { ...douyinEvent([2]), id: "evt-next" };
    const store = makeStore([douyinEvent([1]), next, wecomEvent]);
    store.dispatch(startScenarioDraft({ name: "回归", channelId: "douyin" }));
    await store.dispatch(addScenarioStep({ eventId: "evt-dy-1" }));
    store.dispatch(setStepWait({ index: 0, wait: 2.5 }));
    await store
      .dispatch(replaceScenarioStep({ index: 0, eventId: "evt-next" }))
      .unwrap();
    expect(store.getState().scenarios.draft?.steps).toEqual([
      { eventId: "evt-next", revision: 2, wait: 2.5 },
    ]);
    await expect(
      store
        .dispatch(replaceScenarioStep({ index: 0, eventId: wecomEvent.id }))
        .unwrap(),
    ).rejects.toBeDefined();
    store.dispatch(toggleScenarioFavorite());
    store.dispatch(setScenarioFailure("continue"));
    apiMock.saveScenario.mockImplementationOnce(async (scenario) => [scenario]);
    await store.dispatch(saveScenario()).unwrap();
    expect(store.getState().scenarios.items[0]).toMatchObject({
      favorite: true,
      failure: "continue",
      steps: [{ eventId: "evt-next", wait: 2.5 }],
    });
  });

  it("删除库内其他剧本不清空未保存的新草稿", () => {
    const store = makeStore();
    store.dispatch(startScenarioDraft({ name: "新草稿", channelId: "douyin" }));
    const before = store.getState().scenarios.draft;
    store.dispatch(
      deleteScenario.fulfilled([], "delete-request", "old-scenario"),
    );
    expect(store.getState().scenarios.draft).toEqual(before);
  });
});
