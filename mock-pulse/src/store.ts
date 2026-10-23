import { configureStore } from "@reduxjs/toolkit";

import { connectionsReducer } from "@/features/connections";
import { definitionsReducer, eventsReducer } from "@/features/events";
import { plansReducer } from "@/features/plans";
import { runsReducer } from "@/features/runs";
import { scenariosReducer } from "@/features/scenarios";
import { appReducer } from "@/stores/app-slice";

// 组合根：全项目唯一允许 import feature reducer 的模块（运行时方向 store → features）。
// feature 内访问 RootState/AppDispatch 只能 `import type`，保持运行时单向不环。
// React hooks 位于 hooks/use-app-store.ts，导入它们不触发 store 的创建。
export const store = configureStore({
  reducer: {
    app: appReducer,
    connections: connectionsReducer,
    definitions: definitionsReducer,
    events: eventsReducer,
    plans: plansReducer,
    runs: runsReducer,
    scenarios: scenariosReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
