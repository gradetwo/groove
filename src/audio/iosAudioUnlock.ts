/**
 * iOS Hardware Silent Switch Bypass (Unmute Web Audio)
 * 
 * On iOS Safari / WebKit, WebAudio (AudioContext) is assigned by default to the
 * "Ambient / Ringer" audio session category, which is MUTED whenever the physical
 * hardware silent switch or Action Button Silent Mode is engaged.
 *
 * Playing a short, high-quality, looping silent HTML5 <audio> element forces iOS
 * to switch the WebProcess audio session to "Playback / Media" category, which
 * completely IGNORES the physical silent switch and routes audio to speakers/headphones.
 */

function huffman(count: number, repeatStr: string): string {
  let e = repeatStr;
  for (; count > 1; count--) e += repeatStr;
  return e;
}

// 0.01-second high-quality VBR joint stereo silent MP3 (Spencer Evans / WebAudio standard)
export const SILENCE_MP3_DATA_URI =
  "data:audio/mpeg;base64,//uQx" +
  huffman(23, "A") +
  "WGluZwAAAA8AAAACAAACcQCA" +
  huffman(16, "gICA") +
  huffman(66, "/") +
  "8AAABhTEFNRTMuMTAwA8MAAAAAAAAAABQgJAUHQQAB9AAAAnGMHkkI" +
  huffman(320, "A") +
  "//sQxAADgnABGiAAQBCqgCRMAAgEAH" +
  huffman(15, "/") +
  "7+n/9FTuQsQH//////2NG0jWUGlio5gLQTOtIoeR2WX////X4s9Atb/JRVCbBUpeRUq" +
  huffman(18, "/") +
  "9RUi0f2jn/+xDECgPCjAEQAABN4AAANIAAAAQVTEFNRTMuMTAw" +
  huffman(97, "V") +
  "Q==";

/**
 * Checks if running on iOS (iPhone, iPad, iPod, or iPadOS masquerading as macOS).
 */
export function isIosDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return (
    (ua.includes("iphone") && !ua.includes("like iphone")) ||
    (ua.includes("ipad") && !ua.includes("like ipad")) ||
    (ua.includes("ipod") && !ua.includes("like ipod")) ||
    (ua.includes("mac os x") && navigator.maxTouchPoints > 0)
  );
}

export class IosAudioUnlocker {
  private static instance: IosAudioUnlocker | null = null;

  private channelTag: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private isIOS: boolean = false;
  private isInitialized: boolean = false;
  private isUnlocked: boolean = false;

  private userActionHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;
  /** Resumes whenever the context is not running; see the handler that installs it. */
  private resumeIfNotRunning: (() => void) | null = null;
  /** Reacts to the context being interrupted by the system, which is not a visibility change. */
  private stateChangeHandler: (() => void) | null = null;

  private constructor() {
    if (typeof window !== "undefined") {
      this.isIOS = isIosDevice();
    }
  }

  public static getInstance(): IosAudioUnlocker {
    if (!IosAudioUnlocker.instance) {
      IosAudioUnlocker.instance = new IosAudioUnlocker();
    }
    return IosAudioUnlocker.instance;
  }

  /**
   * Bind active AudioContext to this unlocker
   */
  public setAudioContext(ctx: AudioContext | null): void {
    this.audioContext = ctx;
    if (ctx && this.isUnlocked && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  }

  /**
   * Attempt to unlock Web Audio and switch iOS audio session to Media Playback
   */
  public unlock(): void {
    if (typeof window === "undefined") return;

    // 1. Resume AudioContext
    if (this.audioContext && this.audioContext.state === "suspended") {
      this.audioContext.resume().catch(() => {});
    }

    // 2. Switch iOS audio session category to Playback (ignores silent switch)
    if (this.isIOS) {
      this.startMediaChannel();
    }
  }

  private startMediaChannel(): void {
    if (typeof document === "undefined") return;

    try {
      if (!this.channelTag) {
        const audio = document.createElement("audio");
        // Disable lock screen widget and airplay dialogs
        audio.setAttribute("x-webkit-airplay", "deny");
        audio.setAttribute("playsinline", "true");
        audio.setAttribute("webkit-playsinline", "true");
        (audio as any).disableRemotePlayback = true;
        audio.controls = false;
        audio.preload = "auto";
        audio.loop = true;
        audio.src = SILENCE_MP3_DATA_URI;
        audio.volume = 0.01;
        audio.load();
        this.channelTag = audio;
      }

      if (this.channelTag && this.channelTag.paused) {
        const playPromise = this.channelTag.play();
        if (playPromise) {
          playPromise
            .then(() => {
              this.isUnlocked = true;
            })
            .catch(() => {
              // If failed, destroy tag to retry on next user interaction
              this.destroyChannelTag();
            });
        }
      }
    } catch (e) {
      console.warn("[IosAudioUnlocker] Could not initialize silent media channel:", e);
    }
  }

  private destroyChannelTag(): void {
    if (this.channelTag) {
      try {
        this.channelTag.pause();
        this.channelTag.src = "about:blank";
        this.channelTag.load();
      } catch {}
      this.channelTag = null;
    }
  }

  /**
   * Listen to user activation events to unlock audio on first touch/click
   */
  public init(): void {
    if (typeof window === "undefined" || this.isInitialized) return;
    this.isInitialized = true;

    const events = ["click", "touchstart", "touchend", "pointerdown", "keydown"];
    this.userActionHandler = () => {
      this.unlock();
    };

    events.forEach((evt) => {
      window.addEventListener(evt, this.userActionHandler!, { capture: true, passive: true });
    });

    /**
     * Background/foreground handling.
     *
     * Two things were wrong with this, both of them the "lock the phone and come back to silence" report:
     *
     * 1. it returned immediately on anything that was not iOS, so an Android phone got **no** foreground resume at all — the
     *    media-channel trick below is genuinely iOS-only, but resuming the context is not;
     * 2. it only resumed when the state was exactly `"suspended"`, and Safari's lock-screen interruption reports
     *    **`"interrupted"`** instead (a state the TypeScript union does not even name), which fell through the check and left
     *    the app silent until a reload.
     *
     * So the platform-specific part stays iOS-only and the resume happens whenever the context is not running, on
     * foreground, on focus, and on the context's own `statechange` (which is what fires when the system interrupts it).
     */
    const resumeIfNotRunning = () => {
      const ctx = this.audioContext;
      if (!ctx) return;
      // `interrupted` is Safari's own state and is not in the `AudioContextState` union; comparing as a string is the only
      // way to see it, and `!== "running"` catches it along with `suspended` and `closed`.
      if ((ctx.state as string) !== "running") ctx.resume().catch(() => {});
    };
    this.resumeIfNotRunning = resumeIfNotRunning;

    this.visibilityHandler = () => {
      if (document.hidden || !document.hasFocus()) {
        // App in background: halt silent channel to conserve battery (an iOS-only mechanism).
        if (this.isIOS) this.destroyChannelTag();
        return;
      }
      if (this.isIOS) this.startMediaChannel();
      resumeIfNotRunning();
    };

    /** The system interrupting the context is not a visibility change, and it needs the same answer. */
    const stateChangeHandler = () => {
      if (!document.hidden) resumeIfNotRunning();
    };
    this.stateChangeHandler = stateChangeHandler;

    document.addEventListener("visibilitychange", this.visibilityHandler);
    window.addEventListener("focus", this.visibilityHandler);
    window.addEventListener("blur", this.visibilityHandler);
    this.audioContext?.addEventListener?.("statechange", stateChangeHandler);
  }

  public dispose(): void {
    if (typeof window === "undefined") return;

    if (this.stateChangeHandler) {
      this.audioContext?.removeEventListener?.("statechange", this.stateChangeHandler);
      this.stateChangeHandler = null;
    }
    this.resumeIfNotRunning = null;
    if (this.userActionHandler) {
      const events = ["click", "touchstart", "touchend", "pointerdown", "keydown"];
      events.forEach((evt) => {
        window.removeEventListener(evt, this.userActionHandler!, { capture: true } as any);
      });
      this.userActionHandler = null;
    }

    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      window.removeEventListener("focus", this.visibilityHandler);
      window.removeEventListener("blur", this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.destroyChannelTag();
    this.isInitialized = false;
    this.isUnlocked = false;
    this.audioContext = null;
  }
}

/**
 * Global helper to initialize iOS hardware silent switch bypass
 */
export function initIosAudioUnlock(audioContext?: AudioContext | null): IosAudioUnlocker {
  const unlocker = IosAudioUnlocker.getInstance();
  unlocker.init();
  if (audioContext) {
    unlocker.setAudioContext(audioContext);
  }
  return unlocker;
}
