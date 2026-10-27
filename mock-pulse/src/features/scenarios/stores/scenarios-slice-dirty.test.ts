import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";

import { eventsReducer, initialEventsState } from "@/features/events";

import * as api from "../api";
import type { Scenario } from "../model";
import {
  initialScenariosState,
  openScenario,
  type ScenariosState,
  saveScenario,
  scenariosReducer,
  selectScenarioDirty,
  setDraftName,
  startScenarioDraft,
} from "./scenarios-slice";

vi.mock("../api", () => ({
  loadScenarios: vi.fn(),
  saveScenario: vi.fn(),
  deleteScenarioById: vi.fn(),
}));

const apiMock = vi.mocked(api, true);

/**
 * 剧本草稿脏判定装配钉住（lib/draft-dirty 四域装配之一）：
 * 新建零编辑不脏（touched 门，切视图不再误弹「放弃更改」）、
 * 编辑即脏、保存后回包等值清脏、保存途中又动手仍脏。
 */

function makeStore(items: Scenario[] = []) {
  return configureStore({
    reducer: { scenarios: scenariosReducer, events: eventsReducer },
    preloadedState: {
      scenarios: { ...initialScenariosState, items },
      events: { ...initialEventsState, loaded: true },
    },
  });
}

const saved: Scenario = {
  id: "scn-saved",
  name: "已保存剧本",
  channelId: "douyin",
  steps: [],
};

function dirtyOf(store: { getState: () => unknown }): boolean {
  return selectScenarioDirty(
    (store.getState() as { scenarios: ScenariosState }).scenarios,
  );
}

describe("剧本草稿脏判定（touched 门 + 内容差）", () => {
  it("新建零编辑不脏；打开库内剧本零编辑不脏", () => {
    const store = makeStore([saved]);
    store.dispatch(startScenarioDraft({ name: "新剧本", channelId: "douyin" }));
    expect(dirtyOf(store)).toBe(false);

    store.dispatch(openScenario(saved.id));
    expect(dirtyOf(store)).toBe(false);
  });

  it("编辑即脏（新建无基线动手即脏；已保存的与基线比内容）", () => {
    const store = makeStore([saved]);
    store.dispatch(startScenarioDraft({ name: "新剧本", channelId: "douyin" }));
    store.dispatch(setDraftName("改了名"));
    expect(dirtyOf(store)).toBe(true);

    store.dispatch(openScenario(saved.id));
    store.dispatch(setDraftName("已保存剧本·改"));
    expect(dirtyOf(store)).toBe(true);
  });

  it("保存后回包等值清脏", async () => {
    const store = makeStore();
    store.dispatch(startScenarioDraft({ name: "新剧本", channelId: "douyin" }));
    store.dispatch(setDraftName("定稿"));
    expect(dirtyOf(store)).toBe(true);
    apiMock.saveScenario.mockImplementationOnce(async (scenario) => [scenario]);

    await store.dispatch(saveScenario()).unwrap();

    expect(store.getState().scenarios.items[0]?.name).toBe("定稿");
    expect(dirtyOf(store)).toBe(false);
  });

  it("保存途中又动手，回包后仍脏", async () => {
    const store = makeStore();
    store.dispatch(startScenarioDraft({ name: "竞态", channelId: "douyin" }));
    let finish!: (scenarios: Scenario[]) => void;
    let sent!: Scenario;
    apiMock.saveScenario.mockImplementationOnce((scenario) => {
      sent = scenario;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const pending = store.dispatch(saveScenario());
    store.dispatch(setDraftName("保存途中又改"));
    finish([sent]);
    await pending;

    expect(dirtyOf(store)).toBe(true);
  });
});
