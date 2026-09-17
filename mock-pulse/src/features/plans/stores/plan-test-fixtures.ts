import { configureStore } from "@reduxjs/toolkit";

import {
  type ConnectionConfig,
  connectionsReducer,
  initialConnectionsState,
} from "@/features/connections";
import {
  type EventItem,
  eventsReducer,
  initialEventsState,
} from "@/features/events";
import { runsReducer } from "@/features/runs";
import {
  initialScenariosState,
  type Scenario,
  scenariosReducer,
} from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";

import { addLane, createPlan, type Plan } from "../model";
import { initialPlansState, plansReducer } from "./plans-slice";

export const DY_CONNECTION: ConnectionConfig = {
  channel: "douyin",
  url: "http://127.0.0.1:9999/webhooks/douyin",
  clientKey: "tt_key",
  clientSecret: "tt_secret",
  system: "dop",
  miniGameToken: "",
  isvToken: "",
  isvKey: "",
};

export const WC_CONNECTION: ConnectionConfig = {
  channel: "wecom",
  url: "http://127.0.0.1:9999/webhooks/wecom",
  system: "agent",
  corpId: "ww_corp",
  token: "QDG6eK",
  encodingAesKey: "jWmYm7qr5nMoAUwZRjGtBxmz3KA1tkAj3ykkR6q2B2C",
  agentId: "218",
};

export const SCENARIO_ITEMS: Scenario[] = [
  {
    id: "scn-dy",
    name: "抖音接待",
    channelId: "douyin",
    steps: [
      { eventId: "evt-dy-1", revision: 1 },
      { eventId: "evt-dy-1", revision: 2 },
    ],
  },
  {
    id: "scn-wc",
    name: "企微接待",
    channelId: "wecom",
    steps: [{ eventId: "evt-wc-1", revision: 1 }],
  },
];

/** 抖音事件（dy-text）：两个版本，物化明文的引用事实源 */
export function douyinEvent(): EventItem {
  const version = (revision: number, text: string) => ({
    revision,
    savedAt: `2026-09-12T0${revision}:00:00.000Z`,
    payload: {
      event: "im_receive_msg",
      client_key: "tt_key",
      from_user_id: "user-1",
      content: { text, conversation_type: 1 },
    },
    expected: { status: 200, body: "", bodyMode: "contains" as const },
  });
  return {
    id: "evt-dy-1",
    name: "新客问价",
    channelId: "douyin",
    schemaId: "dy-text",
    versions: [version(1, "你好"), version(2, "在吗")],
  };
}

export function wecomEvent(): EventItem {
  return {
    id: "evt-wc-1",
    name: "企微文本",
    channelId: "wecom",
    schemaId: "wc-text",
    versions: [
      {
        revision: 1,
        savedAt: "2026-09-12T01:00:00.000Z",
        payload: {
          ToUserName: "ww_corp",
          FromUserName: "member1",
          CreateTime: "1348831860",
          MsgType: "text",
          Content: "你好，企业微信",
          MsgId: "7151772163216742434",
          AgentID: "218",
        },
        expected: { status: 200, body: "success", bodyMode: "wecomReply" },
      },
    ],
  };
}

export const SAVED_PLAN: Plan = addLane(
  addLane(createPlan("双平台接待回归", "parallel"), "scn-dy"),
  "scn-wc",
);

/** 剧本库 + 事件库 + 连接态注入（plans 运行链路的全部依赖；
 *  reducer 形状对齐全局 RootState，startPlanRun 的 state 泛型才可派发） */
export function makeStore(
  connections: Record<string, ConnectionConfig> = {},
  draft: Plan | null = null,
) {
  return configureStore({
    reducer: {
      app: appReducer,
      plans: plansReducer,
      scenarios: scenariosReducer,
      events: eventsReducer,
      runs: runsReducer,
      connections: connectionsReducer,
    },
    preloadedState: {
      plans: { ...initialPlansState, items: [SAVED_PLAN], draft },
      scenarios: { ...initialScenariosState, items: SCENARIO_ITEMS },
      events: {
        ...initialEventsState,
        items: [douyinEvent(), wecomEvent()],
        loaded: true,
      },
      connections: {
        ...initialConnectionsState,
        loaded: true,
        items: connections,
      },
    },
  });
}
