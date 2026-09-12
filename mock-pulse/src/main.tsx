import React from "react";
import ReactDOM from "react-dom/client";
import { Provider } from "react-redux";

import { ThemeProvider } from "@/components/theme-provider";
import { store } from "@/store";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </Provider>
  </React.StrictMode>,
);
