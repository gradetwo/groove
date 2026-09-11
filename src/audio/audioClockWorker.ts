/**
 * Dedicated Web Worker for Audio Engine Clock & Transport Scheduling
 * Runs in a separate OS thread to avoid main-thread UI rendering lag,
 * ruler dragging, or drawer animation stalls causing audio clock drift and dropouts.
 */

let timerId: any = null;
let tickIntervalMs = 20; // 20ms precision interval (50Hz unthrottled clock)

// Web Worker message listener
self.onmessage = (e: MessageEvent) => {
  const data = e.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case "START": {
      if (data.intervalMs && typeof data.intervalMs === "number") {
        tickIntervalMs = Math.max(5, Math.min(100, data.intervalMs));
      }
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => {
        self.postMessage({
          type: "TICK",
          now: performance.now(),
        });
      }, tickIntervalMs);
      self.postMessage({ type: "STARTED", intervalMs: tickIntervalMs });
      break;
    }

    case "STOP": {
      if (timerId) {
        clearInterval(timerId);
        timerId = null;
      }
      self.postMessage({ type: "STOPPED" });
      break;
    }

    case "SET_INTERVAL": {
      if (data.intervalMs && typeof data.intervalMs === "number") {
        tickIntervalMs = Math.max(5, Math.min(100, data.intervalMs));
        if (timerId) {
          clearInterval(timerId);
          timerId = setInterval(() => {
            self.postMessage({
              type: "TICK",
              now: performance.now(),
            });
          }, tickIntervalMs);
        }
      }
      break;
    }

    default:
      break;
  }
};
