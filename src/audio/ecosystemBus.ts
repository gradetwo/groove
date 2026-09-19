/**
 * Wangda Audio Ecosystem Bus (P-NEXT: EcoSync)
 *
 * Implements cross-tab / cross-window / cross-origin communication via BroadcastChannel
 * to synchronize the Wangda Audio Ecosystem:
 * - groove.wangda.today (The Groove / Rhythm / Kick Engine)
 * - synth.wangda.today (GS-1 WebAssembly Polyphonic Synthesizer)
 *
 * Capabilities:
 * - Clock Sync: BPM, Transport state (play/stop), Bar & Step phase locking.
 * - Transient Bus: Sub / Thump / Click hit dispatch for audio-reactive visual resonance.
 * - Harmonic Routing: Chord & pitch dispatch to sync synth voicing.
 */

export type WangdaAudioMessage =
  | {
      type: "CLOCK_SYNC";
      bpm: number;
      isPlaying: boolean;
      currentStep: number;
      bar: number;
      timestamp: number;
    }
  | {
      type: "CLOCK_START";
      bpm: number;
      timestamp: number;
    }
  | {
      type: "CLOCK_STOP";
      timestamp: number;
    }
  | {
      type: "TRANSIENT_HIT";
      layer: "sub" | "thump" | "click" | "master";
      velocity: number;
      pitch: number;
      plv: number;
      timestamp: number;
    }
  | {
      type: "CHORD_TRIGGER";
      notes: number[];
      chordName: string;
      duration: number;
      timestamp: number;
    };

export type EcosystemBusListener = (msg: WangdaAudioMessage) => void;

class WangdaEcosystemBus {
  private channel: BroadcastChannel | null = null;
  private listeners: Set<EcosystemBusListener> = new Set();
  private isOnline = false;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      try {
        this.channel = new BroadcastChannel("wangda_audio_bus");
        this.channel.onmessage = (event: MessageEvent<WangdaAudioMessage>) => {
          this.notifyListeners(event.data);
        };
        this.isOnline = true;
      } catch (e) {
        console.warn("[EcosystemBus] Failed to initialize BroadcastChannel:", e);
        this.isOnline = false;
      }
    }
  }

  public getIsOnline(): boolean {
    return this.isOnline;
  }

  public subscribe(listener: EcosystemBusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(msg: WangdaAudioMessage): void {
    this.listeners.forEach((listener) => {
      try {
        listener(msg);
      } catch (err) {
        console.error("[EcosystemBus] Error in listener callback:", err);
      }
    });
  }

  public publish(msg: WangdaAudioMessage): void {
    // Notify local subscribers first
    this.notifyListeners(msg);

    // Broadcast across windows/tabs
    if (this.channel) {
      try {
        this.channel.postMessage(msg);
      } catch (e) {
        console.warn("[EcosystemBus] Error posting message:", e);
      }
    }
  }

  public publishClockSync(bpm: number, isPlaying: boolean, currentStep: number, bar = 1): void {
    this.publish({
      type: "CLOCK_SYNC",
      bpm,
      isPlaying,
      currentStep,
      bar,
      timestamp: performance.now(),
    });
  }

  public publishClockStart(bpm: number): void {
    this.publish({
      type: "CLOCK_START",
      bpm,
      timestamp: performance.now(),
    });
  }

  public publishClockStop(): void {
    this.publish({
      type: "CLOCK_STOP",
      timestamp: performance.now(),
    });
  }

  public publishTransientHit(
    layer: "sub" | "thump" | "click" | "master",
    velocity = 1.0,
    pitch = 48,
    plv = 0.92
  ): void {
    this.publish({
      type: "TRANSIENT_HIT",
      layer,
      velocity,
      pitch,
      plv,
      timestamp: performance.now(),
    });
  }

  public publishChordTrigger(notes: number[], chordName: string, duration = 2.0): void {
    this.publish({
      type: "CHORD_TRIGGER",
      notes,
      chordName,
      duration,
      timestamp: performance.now(),
    });
  }

  public destroy(): void {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    this.listeners.clear();
    this.isOnline = false;
  }
}

export const ecosystemBus = new WangdaEcosystemBus();
