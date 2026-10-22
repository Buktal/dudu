import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";

import { type RunProgressPayload, runProgress } from "@/features/runs";
import { store } from "@/store";
import App from "./App";
import "./index.css";

// 组合根订阅一次 run-progress 事件（Rust 执行器实时回报每步状态），
// dispatch 唯一的投影 action：runs 域收敛实况投影并入列历史，plans 域
// 监听同一 action 只做编排运行的阶段簿记（见 runs/stores/live.ts）。
// 纯浏览器 dev（无 Tauri IPC）没有事件通道，静默跳过；生产订阅失败
// 不可吞——本订阅是 run-progress 的唯一监听者，吞掉即表现为全局卡死。
listen<RunProgressPayload>("run-progress", (event) => {
  store.dispatch(runProgress(event.payload));
}).catch((error) => {
  if (isTauri()) {
    console.error(
      "[runs] run-progress 订阅失败, 执行进度不可达, error:",
      error,
    );
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
