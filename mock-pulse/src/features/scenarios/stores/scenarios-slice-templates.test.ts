import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import {
  type EventItem,
  eventsReducer,
  initialEventsState,
  schemaById,
} from "@/features/events";

import * as api from "../api";
import type { Scenario } from "../model";
import {
  addScenarioStep,
  addScenarioTemplateStep,
  initialScenariosState,
  replaceScenarioStep,
  replaceScenarioTemplateStep,
  type ScenariosState,
  saveScenario,
  scenariosReducer,
  selectScenarioDraft,
  selectScenarios,
  setStepWait,
  startScenarioDraft,
  syncAllScenarioSteps,
  syncScenarioStep,
} from "./scenarios-slice";

// 内置模板步骤（ADR-0009 纯引用、版本钉住）的 slice 级测试：
// 与 scenarios-slice.test.ts 同库分文件（按职责拆分，单文件 ≤ 500 行）。

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

describe("内置模板步骤（ADR-0009 纯引用、版本钉住）", () => {
  const TEMPLATE_VERSION = schemaById("dy-text").version;

  it("添加模板步骤钉住模板当前版本并保存入库", async () => {
    const store = makeStore([]);
    store.dispatch(
      startScenarioDraft({ name: "模板接待", channelId: "douyin" }),
    );

    await store.dispatch(addScenarioTemplateStep({ templateId: "dy-text" }));
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION, wait: 0 },
    ]);

    apiMock.saveScenario.mockImplementation(async (scenario: Scenario) => [
      scenario,
    ]);
    await store.dispatch(saveScenario());
    expect(selectScenarios(store.getState().scenarios)[0]?.steps).toEqual([
      { templateId: "dy-text", templateVersion: TEMPLATE_VERSION, wait: 0 },
    ]);
  });

  it("添加他渠道模板被领域层拒绝（可读错误，草稿不变）", async () => {
    const store = makeStore([]);
    store.dispatch(
      startScenarioDraft({ name: "抖音接待", channelId: "douyin" }),
    );

    await expect(
      store
        .dispatch(addScenarioTemplateStep({ templateId: "wc-text" }))
        .unwrap(),
    ).rejects.toThrow(/剧本渠道已锁定为抖音，不能添加企业微信的/);
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([]);
  });

  it("添加未注册模板 id 被拒绝（可读错误）", async () => {
    const store = makeStore([]);
    store.dispatch(
      startScenarioDraft({ name: "抖音接待", channelId: "douyin" }),
    );
    await expect(
      store
        .dispatch(addScenarioTemplateStep({ templateId: "dy-gone" }))
        .unwrap(),
    ).rejects.toThrow(/未知事件模板：dy-gone/);
  });

  it("整体同步只更新事件步骤：模板步骤钉住创建时版本不动", async () => {
    const store = makeStore([douyinEvent([1, 2])]);
    store.dispatch(startScenarioDraft({ name: "混合", channelId: "douyin" }));
    await store.dispatch(addScenarioStep({ eventId: "evt-dy-1" }));
    await store.dispatch(addScenarioTemplateStep({ templateId: "dy-text" }));

    await store.dispatch(syncAllScenarioSteps());
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([
      { eventId: "evt-dy-1", revision: 2, wait: 0 },
      {
        templateId: "dy-text",
        templateVersion: TEMPLATE_VERSION,
        wait: 0.6,
      },
    ]);
  });

  it("单步同步模板步骤为无操作（钉住语义）", async () => {
    const store = makeStore([]);
    store.dispatch(startScenarioDraft({ name: "钉住", channelId: "douyin" }));
    await store.dispatch(addScenarioTemplateStep({ templateId: "dy-text" }));
    const before = selectScenarioDraft(store.getState().scenarios)?.steps;

    await store.dispatch(syncScenarioStep({ index: 0 }));
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual(
      before,
    );
  });

  it("替换模板步骤保留等待并钉住新模板版本；换成事件时不残留模板字段", async () => {
    const store = makeStore([douyinEvent([2])]);
    store.dispatch(startScenarioDraft({ name: "替换", channelId: "douyin" }));
    await store.dispatch(addScenarioTemplateStep({ templateId: "dy-text" }));
    store.dispatch(setStepWait({ index: 0, wait: 1.5 }));

    await store.dispatch(
      replaceScenarioTemplateStep({ index: 0, templateId: "dy-enter" }),
    );
    expect(selectScenarioDraft(store.getState().scenarios)?.steps).toEqual([
      {
        templateId: "dy-enter",
        templateVersion: schemaById("dy-enter").version,
        wait: 1.5,
      },
    ]);

    await store.dispatch(
      replaceScenarioStep({ index: 0, eventId: "evt-dy-1" }),
    );
    const replaced = selectScenarioDraft(store.getState().scenarios)?.steps[0];
    expect(replaced).toEqual({
      eventId: "evt-dy-1",
      revision: 2,
      wait: 1.5,
    });
    expect("templateId" in (replaced ?? {})).toBe(false);
  });

  it("保存时走私的模板缺失引用被整体拒绝（未注册 id）", async () => {
    const smuggled: Scenario = {
      id: "scn-tpl-x",
      name: "走私模板",
      channelId: "douyin",
      steps: [{ templateId: "dy-gone", templateVersion: TEMPLATE_VERSION }],
    };
    const store = makeStore([], { draft: smuggled });
    await expect(store.dispatch(saveScenario()).unwrap()).rejects.toThrow(
      /步骤引用的内置模板不存在：dy-gone/,
    );
    expect(apiMock.saveScenario).not.toHaveBeenCalled();
  });

  it("保存时走私的超前版本被整体拒绝（注册表没有钉住的版本）", async () => {
    const smuggled: Scenario = {
      id: "scn-tpl-y",
      name: "超前模板",
      channelId: "douyin",
      steps: [{ templateId: "dy-text", templateVersion: "2999.01" }],
    };
    const store = makeStore([], { draft: smuggled });
    await expect(store.dispatch(saveScenario()).unwrap()).rejects.toThrow(
      /步骤引用的内置模板版本不存在：dy-text v2999\.01/,
    );
    expect(apiMock.saveScenario).not.toHaveBeenCalled();
  });
});
