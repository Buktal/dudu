import React from "react";
import ReactDOM from "react-dom/client";
import { ThemeProvider } from "@/components/theme-provider";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider defaultTheme="light" storageKey="dudu-admin.theme">
      <App />
    </ThemeProvider>
  </React.StrictMode>,
);
