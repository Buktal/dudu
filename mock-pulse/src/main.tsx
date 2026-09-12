import { listen } from "@tauri-apps/api/event";
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";

import { ThemeProvider } from "@/components/theme-provider";
import { onPlanProgress } from "@/features/plans";
import { onRunProgress, type RunProgressPayload } from "@/features/runs";
import { store } from "@/store";
import App from "./App";
import "./index.css";

// 组合根订阅一次 run-progress 事件（Rust 执行器实时回报每步状态），
// dispatch 进两个域的 reducer：runs 承载剧本运行与历史入列，plans 承载
// 编排运行实况（按 runId 过滤、按 lane 路由）。各自内部再按域收敛状态。
// 纯浏览器 dev（无 Tauri IPC）没有事件通道，静默跳过。
listen<RunProgressPayload>("run-progress", (event) => {
  store.dispatch(onRunProgress(event.payload));
  store.dispatch(onPlanProgress(event.payload));
}).catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
