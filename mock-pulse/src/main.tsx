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
// 纯浏览器 dev（无 Tauri IPC）没有事件通道，静默跳过。
listen<RunProgressPayload>("run-progress", (event) => {
  store.dispatch(runProgress(event.payload));
}).catch(() => undefined);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>,
);
