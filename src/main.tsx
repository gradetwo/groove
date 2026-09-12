import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { initPwa } from "./utils/pwa";
import { initIosAudioUnlock } from "./audio/iosAudioUnlock";

// Initialize PWA Service Worker & App Shell offline caching (P4-07)
initPwa();

// Initialize iOS Silent Switch Bypass & Web Audio Unmute
initIosAudioUnlock();

import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Groove Lab 系统初始化异常 / Application Init Error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

