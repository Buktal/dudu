import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/* 首访无存储时固定 light（与 admin 对齐，见 ADR-0016 受控拷贝） */}
    <ThemeProvider defaultTheme="light" storageKey="dudu-console.theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
