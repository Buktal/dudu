import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  History,
  ListVideo,
  type LucideIcon,
  Plug,
  Workflow,
  Zap,
} from "lucide-react";

export const VIEW_IDS = [
  "events",
  "scenarios",
  "plans",
  "runs",
  "connections",
] as const;

export type ViewId = (typeof VIEW_IDS)[number];

/** 侧栏分组：build=构建与调试、monitor=运行记录、bottom=平台连接固定底部 */
export type NavSection = "build" | "monitor" | "bottom";

export type ViewEntry = {
  id: ViewId;
  /** 侧栏与面包屑显示名 */
  name: string;
  /** 空态/入口的一句话定位，沿用原型文案 */
  hint: string;
  /** 本票只有平台连接落地，其余视图为明确空态 */
  implemented: boolean;
  icon: LucideIcon;
  navSection: NavSection;
};

/** 五视图唯一注册表：名称/文案/图标/侧栏分组都在这里，视图侧只消费 */
export const VIEWS: readonly ViewEntry[] = [
  {
    id: "events",
    name: "事件调试",
    hint: "调好一条，反复复用。",
    implemented: false,
    icon: Zap,
    navSection: "build",
  },
  {
    id: "scenarios",
    name: "平台剧本",
    hint: "同平台的事件，按顺序串起来。",
    implemented: false,
    icon: ListVideo,
    navSection: "build",
  },
  {
    id: "plans",
    name: "执行编排",
    hint: "让多个剧本一起跑，或依次跑。",
    implemented: false,
    icon: Workflow,
    navSection: "build",
  },
  {
    id: "runs",
    name: "运行记录",
    hint: "查看每次模拟运行时的参数和回执。",
    implemented: false,
    icon: History,
    navSection: "monitor",
  },
  {
    id: "connections",
    name: "平台连接",
    hint: "为不同平台分别设置目标服务。",
    implemented: true,
    icon: Plug,
    navSection: "bottom",
  },
];

const VIEW_ID_SET = new Set<string>(VIEW_IDS);

export type AppState = {
  view: ViewId;
  views: readonly ViewEntry[];
};

export const initialAppState: AppState = {
  view: "events",
  views: VIEWS,
};

function isViewId(value: unknown): value is ViewId {
  return typeof value === "string" && VIEW_ID_SET.has(value);
}

export const appSlice = createSlice({
  name: "app",
  initialState: initialAppState,
  reducers: {
    setView(state, action: PayloadAction<ViewId>) {
      if (!isViewId(action.payload)) {
        throw new Error(`未知视图：${String(action.payload)}`);
      }
      state.view = action.payload;
    },
  },
});

export const { setView } = appSlice.actions;

export const appReducer = appSlice.reducer;

export const selectView = (state: AppState): ViewId => state.view;

export const selectViews = (state: AppState): readonly ViewEntry[] =>
  state.views;

/** 注册表必命中：view 只能来自受校验的 setView 或初始态 */
export function viewEntry(view: ViewId): ViewEntry {
  const found = VIEWS.find((entry) => entry.id === view);
  if (!found) {
    throw new Error(`视图未注册：${view}`);
  }
  return found;
}
