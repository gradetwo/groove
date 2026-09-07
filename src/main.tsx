import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Register Service Worker in production
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(
      (registration) => {
        console.log("ServiceWorker registration successful with scope: ", registration.scope);
      },
      (err) => {
        console.log("ServiceWorker registration failed: ", err);
      }
    );
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
