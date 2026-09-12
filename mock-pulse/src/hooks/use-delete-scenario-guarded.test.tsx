import { configureStore } from "@reduxjs/toolkit";
import { renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

import { initialPlansState, type Plan, plansReducer } from "@/features/plans";
import * as plansApi from "@/features/plans/api";
import { addLane, createPlan } from "@/features/plans/model";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import * as scenariosApi from "@/features/scenarios/api";

import { useDeleteScenarioGuarded } from "./use-delete-scenario-guarded";

vi.mock("@/features/plans/api", () => ({
  loadPlans: vi.fn(),
  savePlan: vi.fn(),
  deletePlanById: vi.fn(),
  startPlanRun: vi.fn(),
}));

vi.mock("@/features/scenarios/api", () => ({
  loadScenarios: vi.fn(),
  saveScenario: vi.fn(),
  deleteScenarioById: vi.fn(),
}));

const plansApiMock = vi.mocked(plansApi, true);
const scenariosApiMock = vi.mocked(scenariosApi, true);

const scenario: Scenario = {
  id: "scn-saved",
  name: "已保存剧本",
  channelId: "douyin",
  steps: [{ eventId: "evt-dy-1", revision: 1 }],
};

const referencingPlan: Plan = addLane(
  createPlan("双平台接待回归", "parallel"),
  "scn-saved",
);

/** 组合根级 store：真实 plans/scenarios reducer + mock 持久层 */
function makeStore(options: { plansLoaded: boolean; plans: Plan[] }) {
  return configureStore({
    reducer: { plans: plansReducer, scenarios: scenariosReducer },
    preloadedState: {
      plans: {
        ...initialPlansState,
        items: options.plansLoaded ? options.plans : [],
        loaded: options.plansLoaded,
      },
      scenarios: {
        ...initialScenariosState,
        items: [scenario],
        loaded: true,
      },
    },
  });
}

function renderGuard(store: ReturnType<typeof makeStore>) {
  return renderHook(() => useDeleteScenarioGuarded(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
}

describe("组合根编排：先查编排引用再删剧本（useDeleteScenarioGuarded）", () => {
  it("被编排引用的剧本删除被拒绝：可读错误含编排名，不触达持久层", async () => {
    const store = makeStore({ plansLoaded: true, plans: [referencingPlan] });
    scenariosApiMock.deleteScenarioById.mockResolvedValue([]);
    const { result } = renderGuard(store);

    await expect(result.current("scn-saved")).rejects.toThrow(
      /剧本被编排引用：「双平台接待回归」。先删除或调整编排，再删除剧本。/,
    );
    expect(scenariosApiMock.deleteScenarioById).not.toHaveBeenCalled();
  });

  it("未被引用的剧本正常走剧本删除流程", async () => {
    const store = makeStore({ plansLoaded: true, plans: [referencingPlan] });
    scenariosApiMock.deleteScenarioById.mockResolvedValue([]);

    const { result } = renderGuard(store);
    await result.current("scn-gone");

    expect(scenariosApiMock.deleteScenarioById).toHaveBeenCalledWith(
      "scn-gone",
    );
  });

  it("编排库未装载时先拉取再查引用（本会话未打开编排视图也不漏拦）", async () => {
    const store = makeStore({ plansLoaded: false, plans: [] });
    plansApiMock.loadPlans.mockResolvedValueOnce([referencingPlan]);
    scenariosApiMock.deleteScenarioById.mockResolvedValue([]);
    const { result } = renderGuard(store);

    await expect(result.current("scn-saved")).rejects.toThrow(/剧本被编排引用/);
    expect(plansApiMock.loadPlans).toHaveBeenCalledTimes(1);
    expect(scenariosApiMock.deleteScenarioById).not.toHaveBeenCalled();
  });
});
