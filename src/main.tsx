import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
/**
 * The default palette, eager.
 *
 * `desktopTokens.css` is generated (`scripts/desktop_skins.mjs`) and carries the *default* skin's values on
 * `:root`, so a page that never sets `data-skin` — the first paint, a test, a screenshot of the app as it
 * always looked — has the palette it needs. The five other palettes and the literal map live in
 * `desktopSkins.css`, which `useSkin.ts` loads with the skin that needs it.
 */
import "./styles/desktopTokens.css";
/*
 * The skins' *character* sheets (type, edges, texture) are **not** imported here: exactly one of the five is
 * ever in use, and they were 6 KB of gzip on the initial route for CSS that a default-skin load never
 * applies. `useSkin.ts` imports the active one by name the moment a skin is applied — see
 * `loadCharacterSheet`. The palette next door stays eager, because every skin needs one.
 */

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

