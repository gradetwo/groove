/**
 * Dedicated Web Worker for Audio Engine Clock & Transport Scheduling
 * Runs in a separate OS thread to avoid main-thread UI rendering lag,
 * ruler dragging, or drawer animation stalls causing audio clock drift and dropouts.
 */

export interface WorkerStepCalcRequest {
  bpm: number;
  swing: number;
  resolution: "1/8" | "1/16" | "1/32";
  timeSignature: string;
  totalSteps: number;
  currentStep: number;
  currentTime: number;
  scheduleAheadSec: number;
  nextStepTime: number;
}

export interface WorkerStepCalcResult {
  step: number;
  actualStepTime: number;
  stepDur: number;
  nextStepTime: number;
  nextStep: number;
}

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

    case "CALCULATE_TRANSPORT_STEP": {
      const {
        bpm,
        swing,
        resolution,
        timeSignature,
        totalSteps,
        currentStep,
        currentTime,
        scheduleAheadSec,
        nextStepTime,
      } = data.payload as WorkerStepCalcRequest;

      const beatSec = 60.0 / Math.max(30, Math.min(300, bpm));
      const parts = (timeSignature || "4/4").split("/");
      const denom = parseInt(parts[1], 10) || 4;
      const baseSec = denom === 8 ? beatSec / 2 : denom === 2 ? beatSec * 2 : beatSec;

      let stepDur = baseSec / 4;
      if (resolution === "1/8") stepDur = baseSec / 2;
      else if (resolution === "1/32") stepDur = baseSec / 8;

      const results: WorkerStepCalcResult[] = [];
      let nextTime = nextStepTime;
      let s = currentStep;
      const stepsCount = totalSteps > 0 ? totalSteps : 16;

      while (nextTime < currentTime + scheduleAheadSec) {
        const swingOffset = s % 2 === 1 && swing > 0 ? swing * 0.5 * stepDur : 0;
        const actualStepTime = nextTime + swingOffset;

        results.push({
          step: s,
          actualStepTime,
          stepDur,
          nextStepTime: nextTime + stepDur,
          nextStep: (s + 1) % stepsCount,
        });

        nextTime += stepDur;
        s = (s + 1) % stepsCount;
      }

      self.postMessage({
        type: "TRANSPORT_STEP_CALCULATED",
        results,
        finalNextStepTime: nextTime,
        finalCurrentStep: s,
      });
      break;
    }

    default:
      break;
  }
};
