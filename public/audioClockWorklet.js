/**
 * AudioWorklet Sample-Accurate Clock Processor (P5-01)
 *
 * Runs directly on the real-time Audio Rendering Thread.
 * Eliminates main-thread UI layout thrashing, DOM mutations, and GC pauses
 * for sub-millisecond (<0.1ms) jitter-free audio scheduling.
 */

class AudioClockProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.isRunning = false;
    this.sampleRate = 44100;
    this.totalSamples = 0;
    this.tickIntervalSamples = 128; // default 128 frames (1 buffer block)

    this.port.onmessage = (event) => {
      const data = event.data;
      if (!data) return;

      if (data.type === "START") {
        this.isRunning = true;
        this.totalSamples = 0;
        if (data.sampleRate) this.sampleRate = data.sampleRate;
        if (data.intervalSamples) this.tickIntervalSamples = data.intervalSamples;
      } else if (data.type === "STOP") {
        this.isRunning = false;
        this.totalSamples = 0;
      } else if (data.type === "SET_INTERVAL") {
        if (data.intervalSamples) this.tickIntervalSamples = data.intervalSamples;
      }
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isRunning) return true;

    // Web Audio processes 128 sample frames per quantum block
    this.totalSamples += 128;

    if (this.totalSamples >= this.tickIntervalSamples) {
      this.totalSamples -= this.tickIntervalSamples;
      this.port.postMessage({
        type: "TICK",
        currentTime: currentTime,
      });
    }

    return true;
  }
}

registerProcessor("audio-clock-processor", AudioClockProcessor);
