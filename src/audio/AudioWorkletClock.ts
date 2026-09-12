/**
 * AudioWorklet Clock Bridge (P5-01)
 *
 * Provides a high-precision, zero-jitter clock source using AudioWorklet,
 * with graceful fallback to Web Worker when AudioWorklet is unavailable.
 */

import { AudioWorkerBridge } from "./AudioWorkerBridge";

export class AudioWorkletClock {
  private workletNode: AudioWorkletNode | null = null;
  private workerFallback: AudioWorkerBridge;
  private isUsingWorklet: boolean = false;
  private onTickCallback?: (time: number) => void;
  private dummyGain: GainNode | null = null;
  private isRunning: boolean = false;
  private currentIntervalMs: number = 20;
  private currentSampleRate: number = 44100;

  constructor() {
    this.workerFallback = new AudioWorkerBridge();
    this.workerFallback.setOnTick((now) => {
      if (!this.isUsingWorklet && this.onTickCallback) {
        this.onTickCallback(now);
      }
    });
  }

  public setOnTick(callback: (time: number) => void): void {
    this.onTickCallback = callback;
  }

  public async init(ctx: AudioContext): Promise<boolean> {
    if (!ctx.audioWorklet) {
      this.isUsingWorklet = false;
      return false;
    }

    try {
      await ctx.audioWorklet.addModule("/audioClockWorklet.js");
      this.workletNode = new AudioWorkletNode(ctx, "audio-clock-processor");
      this.workletNode.port.onmessage = (e) => {
        if (e.data && e.data.type === "TICK" && this.onTickCallback) {
          this.onTickCallback(e.data.currentTime);
        }
      };

      // Worklets need output connection to keep processing loop alive
      this.dummyGain = ctx.createGain();
      this.dummyGain.gain.value = 0;
      this.workletNode.connect(this.dummyGain);
      this.dummyGain.connect(ctx.destination);

      this.isUsingWorklet = true;

      // If clock was already started while init was in flight, seamlessly promote to Worklet
      if (this.isRunning) {
        this.workerFallback.stop();
        const intervalSamples = Math.floor((this.currentIntervalMs / 1000) * this.currentSampleRate);
        this.workletNode.port.postMessage({
          type: "START",
          sampleRate: this.currentSampleRate,
          intervalSamples,
        });
      }

      return true;
    } catch {
      this.isUsingWorklet = false;
      return false;
    }
  }

  public start(intervalMs = 20, sampleRate = 44100): void {
    this.isRunning = true;
    this.currentIntervalMs = intervalMs;
    this.currentSampleRate = sampleRate;

    if (this.isUsingWorklet && this.workletNode) {
      const intervalSamples = Math.floor((intervalMs / 1000) * sampleRate);
      this.workletNode.port.postMessage({
        type: "START",
        sampleRate,
        intervalSamples,
      });
    } else {
      this.workerFallback.start(intervalMs);
    }
  }

  public stop(): void {
    this.isRunning = false;
    if (this.isUsingWorklet && this.workletNode) {
      this.workletNode.port.postMessage({ type: "STOP" });
    } else {
      this.workerFallback.stop();
    }
  }

  public getIsWorkletActive(): boolean {
    return this.isUsingWorklet;
  }

  public destroy(): void {
    this.stop();
    if (this.workletNode) {
      try {
        this.workletNode.disconnect();
      } catch {}
      this.workletNode = null;
    }
    if (this.dummyGain) {
      try {
        this.dummyGain.disconnect();
      } catch {}
      this.dummyGain = null;
    }
    this.workerFallback.destroy();
  }
}
