import { configureStore } from "@reduxjs/toolkit";
import { renderHook, waitFor } from "@testing-library/react";
import { Provider } from "react-redux";
import { describe, expect, it, vi } from "vitest";

import {
  type EventItem,
  eventsReducer,
  initialEventsState,
} from "@/features/events";
import * as eventsApi from "@/features/events/api";
import { initialPlansState, plansReducer } from "@/features/plans";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import * as scenariosApi from "@/features/scenarios/api";
import { useDeleteEventGuarded } from "./use-delete-event-guarded";

vi.mock("@/features/events/api", () => ({
  loadEvents: vi.fn(),
  saveEvent: vi.fn(),
  deleteEventById: vi.fn(),
}));

vi.mock("@/features/scenarios/api", () => ({
  loadScenarios: vi.fn(),
  saveScenario: vi.fn(),
  deleteScenarioById: vi.fn(),
}));

const eventsApiMock = vi.mocked(eventsApi, true);
void scenariosApi;

const douyinEvent: EventItem = {
  id: "evt-dy-1",
  name: "新客问价",
  channelId: "douyin",
  schemaId: "dy-text",
  versions: [
    {
      revision: 1,
      savedAt: "2026-09-12T01:00:00.000Z",
      payload: { event: "im_receive_msg", content: { text: "你好" } },
      expected: { status: 200, body: "", bodyMode: "contains" },
    },
  ],
};

const wecomEvent: EventItem = {
  ...douyinEvent,
  id: "evt-wc-1",
  name: "企微文本",
};

/** 组合根级 store：真实 events/scenarios reducer + mock 持久层 */
function makeStore(steps: Scenario["steps"]) {
  return configureStore({
    reducer: {
      events: eventsReducer,
      scenarios: scenariosReducer,
      plans: plansReducer,
    },
    preloadedState: {
      plans: { ...initialPlansState, loaded: true },
      events: {
        ...initialEventsState,
        items: [douyinEvent, wecomEvent],
        loaded: true,
      },
      scenarios: {
        ...initialScenariosState,
        items: [
          {
            id: "scn-saved",
            name: "已保存剧本",
            channelId: "douyin",
            steps,
          } satisfies Scenario,
        ],
        loaded: true,
      },
    },
  });
}

function renderGuard(store: ReturnType<typeof makeStore>) {
  return renderHook(() => useDeleteEventGuarded(), {
    wrapper: ({ children }) => <Provider store={store}>{children}</Provider>,
  });
}

describe("组合根编排：先查剧本引用再删事件（useDeleteEventGuarded）", () => {
  it("被剧本引用的事件删除被拒绝：可读错误含剧本名，不触达持久层", async () => {
    const store = makeStore([{ eventId: "evt-dy-1", revision: 1 }]);
    eventsApiMock.deleteEventById.mockResolvedValue([]);
    const { result } = renderGuard(store);

    await expect(result.current("evt-dy-1")).rejects.toThrow(
      /事件被剧本引用：「已保存剧本」。先删除或调整剧本，再删除事件。/,
    );
    expect(eventsApiMock.deleteEventById).not.toHaveBeenCalled();
    // 事件与剧本均保持原状
    await waitFor(() => {
      expect(store.getState().events.items).toHaveLength(2);
    });
    expect(store.getState().scenarios.items).toHaveLength(1);
  });

  it("未被引用的事件正常走事件删除流程", async () => {
    const store = makeStore([{ eventId: "evt-dy-1", revision: 1 }]);
    eventsApiMock.deleteEventById.mockResolvedValue([douyinEvent]);

    const { result } = renderGuard(store);
    await result.current("evt-wc-1");

    expect(eventsApiMock.deleteEventById).toHaveBeenCalledWith("evt-wc-1");
    expect(store.getState().events.items.map((event) => event.id)).toEqual([
      "evt-dy-1",
    ]);
  });
});
