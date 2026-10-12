/**
 * AudioWorkerBridge
 * Manages the Web Worker clock and transport scheduling thread.
 * Provides fallback to high-precision timer if Web Workers are unavailable or restricted.
 */

export class AudioWorkerBridge {
  private worker: Worker | null = null;
  private fallbackTimerId: any = null;
  private onTickCallback?: (now: number) => void;

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

  public start(intervalMs: number = 20): void {
    // The interval is handed to the worker below; the main thread does not need to remember it.
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
