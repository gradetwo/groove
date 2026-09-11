import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Unregister legacy Service Worker and clear cache to avoid stale offline assets
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister();
    }
  });
}
if ("caches" in window) {
  caches.keys().then((keys) => {
    for (const key of keys) {
      caches.delete(key);
    }
  });
}

import { ErrorBoundary } from "./components/ErrorBoundary";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Groove Lab 系统初始化异常 / Application Init Error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

