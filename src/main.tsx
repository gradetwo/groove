import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

import { applyStoredSkin } from "./hooks/useSkin";
import { initPwa } from "./utils/pwa";
import { initIosAudioUnlock } from "./audio/iosAudioUnlock";

/**
 * Apply the stored skin **before** the first render.
 *
 * The attribute is what the skin stylesheets select on, and an effect runs after paint: doing this in
 * React would mean a cold load paints the default skin and then swaps, which is a visible flash. Same
 * reasoning as `data-density`.
 */
applyStoredSkin();

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

