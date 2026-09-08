/**
 * AudioWorkerBridge
 * Manages the Web Worker clock and transport scheduling thread.
 * Provides fallback to high-precision timer if Web Workers are unavailable or restricted.
 */

import { WorkerStepCalcRequest, WorkerStepCalcResult } from "./audioClockWorker";

export class AudioWorkerBridge {
  private worker: Worker | null = null;
  private fallbackTimerId: any = null;
  private onTickCallback?: (now: number) => void;
  private onCalcCallback?: (results: WorkerStepCalcResult[], finalNextTime: number, finalStep: number) => void;
  private intervalMs: number = 20;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return;
    }

    try {
      this.worker = new Worker(new URL("./audioClockWorker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data;
        if (!data) return;

        if (data.type === "TICK") {
          if (this.onTickCallback) {
            this.onTickCallback(data.now || performance.now());
          }
        } else if (data.type === "TRANSPORT_STEP_CALCULATED") {
          if (this.onCalcCallback) {
            this.onCalcCallback(data.results, data.finalNextStepTime, data.finalCurrentStep);
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn("[AudioWorker] Worker error, falling back to window timer", err);
        this.worker = null;
      };
    } catch (e) {
      console.warn("[AudioWorker] Could not initialize Web Worker, using precision fallback timer", e);
      this.worker = null;
    }
  }

  public setOnTick(cb: (now: number) => void): void {
    this.onTickCallback = cb;
  }

  public setOnCalc(cb: (results: WorkerStepCalcResult[], finalNextTime: number, finalStep: number) => void): void {
    this.onCalcCallback = cb;
  }

  public start(intervalMs: number = 20): void {
    this.intervalMs = intervalMs;
    if (this.worker) {
      this.worker.postMessage({ type: "START", intervalMs });
    } else {
      this.stopFallback();
      this.fallbackTimerId = setInterval(() => {
        if (this.onTickCallback) {
          this.onTickCallback(performance.now());
        }
      }, intervalMs);
    }
  }

  public stop(): void {
    if (this.worker) {
      this.worker.postMessage({ type: "STOP" });
    }
    this.stopFallback();
  }

  public calculateTransportStep(payload: WorkerStepCalcRequest): void {
    if (this.worker) {
      this.worker.postMessage({ type: "CALCULATE_TRANSPORT_STEP", payload });
    } else {
      // Synchronous fallback calculation
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
      } = payload;

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

      if (this.onCalcCallback) {
        this.onCalcCallback(results, nextTime, s);
      }
    }
  }

  private stopFallback(): void {
    if (this.fallbackTimerId) {
      clearInterval(this.fallbackTimerId);
      this.fallbackTimerId = null;
    }
  }

  public isUsingWorker(): boolean {
    return this.worker !== null;
  }

  public destroy(): void {
    this.stop();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
