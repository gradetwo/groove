import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AudioEngine, DrumKitType } from "../../audio/AudioEngine";
import type { useSequencerStore } from "../../features/sequencer/useSequencerStore";
import { useLanguage } from "../../i18n/LanguageContext";
import { getDefaultDrumKitForGenre } from "../../utils/trackUtils";
import { EmptyState } from "../../ui";
import { BookOpen, Headphones, X } from "lucide-react";
import { ChannelStrip } from "./ChannelStrip";
import { MasterStrip } from "./MasterStrip";
import { getTrackVisual } from "./trackVisuals";
import { followPeak, linearToMeterPosition, peakFromTimeDomain } from "./meterMath";
import { patternForExport } from "../../data/songFlatten";

/**
 * The subset of `useSequencerStore`'s public surface the console actually reads.
 * Deriving it from the hook's real return type keeps the panel structurally
 * impossible to desync from the studio's store.
 */
export type ConsolePanelStore = Pick<
  ReturnType<typeof useSequencerStore>,
  "state" | "commit" | "commitCoalesced"
>;

export interface ConsolePanelProps {
  /**
   * The live `AudioEngine`. The panel never constructs one: the studio route
   * passes its own engine and the standalone route passes the engine it owns,
   * so the floated console and the studio share one audio graph.
   */
  engine: AudioEngine;
  /** The live sequencer store. Never constructed here — always injected. */
  store: ConsolePanelStore;
  /**
   * Drum kit model to apply. Optional: when omitted the panel falls back to the
   * current genre's default (the standalone route has no kit selector). The
   * studio passes its live kit state so the two never fight.
   */
  drumKit?: DrumKitType;
  /** Controlled transport state supplied by the host (the studio). */
  isPlaying?: boolean;
  /** Controlled transport handler supplied by the host (the studio). */
  onToggleTransport?: () => void;
  /** "Back to the studio" affordance (standalone route only). */
  onOpenStudio?: () => void;
  /** Dismiss affordance. Present only when the panel is floated over the studio. */
  onClose?: () => void;
  /** Contextual manual / guide affordance */
  onOpenHelp?: () => void;
  /** `overlay` tightens the chrome for the floated drawer. */
  variant?: "page" | "overlay";
}

interface TrackMeterRefs {
  left: React.MutableRefObject<HTMLDivElement | null>;
  right: React.MutableRefObject<HTMLDivElement | null>;
}

const DEFAULT_TRACK_VOLUME = 0.8;

/**
 * N-01 / P8-02 — Hardware Console panel.
 *
 * A mixing desk for the current sequencer pattern. The store is the single
 * source of truth: every fader / pan / send / mute / solo control reads the
 * track field and writes back through `commit` (discrete toggles) or
 * `commitCoalesced` (continuous drags), so one gesture is one undo step.
 *
 * This component is presentational with respect to its two live dependencies:
 * both the `AudioEngine` and the sequencer store are injected by the host
 * (`HardwareConsoleView` on `/console`, `StudioView` when floated). It used to
 * create its own engine and store, which is exactly what would double the audio
 * graph and desync the mixer when rendered inside the studio.
 *
 * Metering: the master meter runs on the engine's real stereo analysers and every
 * channel meter on the engine's real per-track analyser — both enabled while this
 * panel is mounted via `enableTrackAnalysers(true)` and released on unmount. Samples
 * are written to the DOM from a single requestAnimationFrame loop, so 60fps metering
 * never re-renders React.
 */
export const ConsolePanel: React.FC<ConsolePanelProps> = ({
  engine,
  store,
  drumKit,
  isPlaying: isPlayingProp,
  onToggleTransport,
  onOpenStudio,
  onClose,
  onOpenHelp,
  variant = "page",
}) => {
  const { t } = useLanguage();
  const { state: seqState, commit, commitCoalesced } = store;
  const { currentGenre, pattern, bpm, swing, timeSignature, resolution } = seqState;
  const tracks = useMemo(() => pattern.tracks.slice(0, 8), [pattern.tracks]);

  // N-02: binaural (HRTF) monitoring toggle. Off by default; the engine rebuilds its
  // channel strips when this changes, so the unused panner model costs no CPU.
  const [spatialEnabled, setSpatialEnabled] = useState(false);
  const [localIsPlaying, setLocalIsPlaying] = useState(false);
  // Seeded from the engine's persisted level rather than a hard-coded default, so the
  // fader shows the real master level on mount (the engine keeps it in audio settings).
  const [masterVolume, setMasterVolume] = useState(() => engine.getMasterVolume() ?? DEFAULT_TRACK_VOLUME);

  const effectiveDrumKit = drumKit ?? getDefaultDrumKitForGenre(currentGenre);
  const isPlaying = isPlayingProp ?? localIsPlaying;

  // ----- Meter state (refs only: the rAF loop must not trigger renders) -----
  const trackCountRef = useRef(0);
  trackCountRef.current = tracks.length;
  const masterMeterLeftRef = useRef<HTMLDivElement | null>(null);
  const masterMeterRightRef = useRef<HTMLDivElement | null>(null);
  const masterPeakRef = useRef({ left: 0, right: 0 });
  const trackPeakRef = useRef<number[]>([]);
  // Real per-channel meters: buffers reused across frames.
  const trackAnalyserBuffersRef = useRef<Array<Uint8Array<ArrayBuffer> | null>>([]);
  const masterBuffersRef = useRef<{
    left: Uint8Array<ArrayBuffer> | null;
    right: Uint8Array<ArrayBuffer> | null;
  }>({ left: null, right: null });

  // One stable ref pair per channel, reused as the pattern changes.
  const channelMeterRefs = useMemo<TrackMeterRefs[]>(
    () =>
      tracks.map(() => ({
        left: { current: null as HTMLDivElement | null },
        right: { current: null as HTMLDivElement | null },
      })),
    [tracks.length]
  );

  // ----- Real channel meters: the analysers live on the shared engine --------
  useEffect(() => {
    engine.enableTrackAnalysers(true);
    return () => {
      engine.enableTrackAnalysers(false);
      trackAnalyserBuffersRef.current = [];
    };
  }, [engine]);

  // ----- Spatial monitoring mode (N-02) -------------------------------------
  useEffect(() => {
    engine.setSpatialMode(spatialEnabled);
  }, [engine, spatialEnabled]);

  // Never leave the shared engine stuck in a hidden HRTF mode after close.
  useEffect(() => {
    return () => {
      engine.setSpatialMode(false);
    };
  }, [engine]);

  // ----- Store -> engine sync (audio always matches the console) ------------
  /**
   * B7 — what the transport *plays*.
   *
   * `patternForExport` is the one function that decides what an exporter writes (B4): in song mode it is the
   * flattened arrangement, otherwise the loop being edited. Playback asked a different question and got a different
   * answer — the engine was handed `pattern` — so an arrangement could be exported, measured, and never heard: a
   * 40-bar song played as one looping bar. The editor above keeps showing the loop, because editing a bar and
   * *auditioning the arrangement* are different jobs; what changes is what reaches the speakers.
   */
  const playing = useMemo(
    () =>
      patternForExport({
        songMode: Boolean(seqState.songMode),
        activeSlot: seqState.activeSlot,
        patterns: seqState.patterns,
        current: pattern,
        sections: seqState.sections ?? [],
        genreId: currentGenre.id,
        bpm,
        swing,
        resolution,
        loopRange: seqState.loopRange,
      }),
    [
      seqState.songMode,
      seqState.activeSlot,
      seqState.patterns,
      seqState.sections,
      seqState.loopRange,
      pattern,
      currentGenre.id,
      bpm,
      swing,
      resolution,
    ]
  );

  useEffect(() => {
    engine.setPattern(playing.pattern);
  }, [engine, playing.pattern]);

  useEffect(() => {
    engine.setBpm(bpm);
    engine.setSwing(swing / 100);
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);
  }, [engine, bpm, swing, timeSignature, resolution]);

  useEffect(() => {
    /**
     * A song is played **through**, not looped: the loop range belongs to the pattern being edited, and looping a
     * 16-step window inside a 40-bar arrangement is the same silence in a different shape.
     */
    engine.setLoopRange(playing.isSong ? null : seqState.loopRange);
    engine.setMetronome(seqState.isMetronome);
    engine.setCountIn(seqState.isCountIn);
  }, [engine, playing.isSong, seqState.loopRange, seqState.isMetronome, seqState.isCountIn]);

  useEffect(() => {
    tracks.forEach((track, trackIdx) => {
      engine.setTrackState(trackIdx, {
        mute: Boolean(track.mute),
        solo: Boolean(track.solo),
        volume: track.volume ?? DEFAULT_TRACK_VOLUME,
        pan: track.pan ?? 0,
        sendA: track.sendA ?? 0,
        sendB: track.sendB ?? 0,
        phaseInvert: Boolean(track.phaseInvert),
      });
    });
  }, [engine, tracks]);

  useEffect(() => {
    engine.setDrumKit(effectiveDrumKit);
  }, [engine, effectiveDrumKit]);

  useEffect(() => {
    engine.setMasterVolume(masterVolume);
  }, [engine, masterVolume]);

  // ----- Standalone transport (only when the host does not supply one) ------
  useEffect(() => {
    if (isPlayingProp !== undefined || typeof setInterval === "undefined") return;
    const id = setInterval(() => setLocalIsPlaying(engine.getIsPlaying()), 200);
    return () => clearInterval(id);
  }, [engine, isPlayingProp]);

  // ----- Single 60fps meter loop -------------------------------------------
  useEffect(() => {
    if (typeof requestAnimationFrame === "undefined") return;
    let rafId = 0;

    const readAnalyser = (
      analyser: AnalyserNode | null | undefined,
      key: "left" | "right"
    ): number => {
      if (!analyser) return 0;
      const size = analyser.fftSize || analyser.frequencyBinCount || 2048;
      let buffer = masterBuffersRef.current[key];
      if (!buffer || buffer.length !== size) {
        buffer = new Uint8Array(new ArrayBuffer(size));
        masterBuffersRef.current[key] = buffer;
      }
      analyser.getByteTimeDomainData(buffer);
      return peakFromTimeDomain(buffer);
    };

    const applyLevel = (element: HTMLDivElement | null, linear: number) => {
      if (!element) return;
      element.style.height = `${(linearToMeterPosition(linear) * 100).toFixed(2)}%`;
    };

    const frame = (_now: number) => {
      const stereo = engine.getStereoAnalysers();
      const peakLeft = readAnalyser(stereo?.left, "left");
      const peakRight = readAnalyser(stereo?.right, "right");
      masterPeakRef.current.left = followPeak(masterPeakRef.current.left, peakLeft);
      masterPeakRef.current.right = followPeak(masterPeakRef.current.right, peakRight);
      applyLevel(masterMeterLeftRef.current, masterPeakRef.current.left);
      applyLevel(masterMeterRightRef.current, masterPeakRef.current.right);

      const channelCount = trackCountRef.current;
      for (let trackIdx = 0; trackIdx < channelCount; trackIdx += 1) {
        const refs = channelMeterRefs[trackIdx];
        if (!refs) continue;

        // Channel meters run on the engine's real per-channel analysers, enabled for
        // as long as this panel is mounted. No signal -> analyser missing -> flat meter.
        const channelAnalyser = engine.getTrackAnalyser(trackIdx);
        if (!channelAnalyser) continue;
        const size = channelAnalyser.fftSize || 256;
        let buffer = trackAnalyserBuffersRef.current[trackIdx];
        if (!buffer || buffer.length !== size) {
          buffer = new Uint8Array(new ArrayBuffer(size));
          trackAnalyserBuffersRef.current[trackIdx] = buffer;
        }
        channelAnalyser.getByteTimeDomainData(buffer);
        const peak = followPeak(trackPeakRef.current[trackIdx] ?? 0, peakFromTimeDomain(buffer));
        trackPeakRef.current[trackIdx] = peak;
        applyLevel(refs.left.current, peak);
        applyLevel(refs.right.current, peak);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [engine, channelMeterRefs]);

  // ----- Handlers (store is the only writer) --------------------------------
  const handleVolumeChange = useCallback(
    (trackIdx: number, volume: number) =>
      commitCoalesced({ type: "SET_VOLUME", trackIdx, volume }, `console:volume:${trackIdx}`),
    [commitCoalesced]
  );

  const handlePanChange = useCallback(
    (trackIdx: number, pan: number) =>
      commitCoalesced({ type: "SET_TRACK_PAN", trackIdx, pan }, `console:pan:${trackIdx}`),
    [commitCoalesced]
  );

  const handleSendAChange = useCallback(
    (trackIdx: number, sendA: number) =>
      commitCoalesced({ type: "SET_TRACK_SENDS", trackIdx, sendA }, `console:sendA:${trackIdx}`),
    [commitCoalesced]
  );

  const handleSendBChange = useCallback(
    (trackIdx: number, sendB: number) =>
      commitCoalesced({ type: "SET_TRACK_SENDS", trackIdx, sendB }, `console:sendB:${trackIdx}`),
    [commitCoalesced]
  );

  const handleToggleMute = useCallback(
    (trackIdx: number) => commit({ type: "TOGGLE_MUTE", trackIdx }),
    [commit]
  );

  const handleToggleSolo = useCallback(
    (trackIdx: number) => commit({ type: "TOGGLE_SOLO", trackIdx }),
    [commit]
  );

  const handleTogglePhase = useCallback(
    (trackIdx: number) => commit({ type: "TOGGLE_PHASE_INVERT", trackIdx }),
    [commit]
  );

  const handleToggleTransport = useCallback(() => {
    if (onToggleTransport) {
      onToggleTransport();
      return;
    }
    if (engine.getIsPlaying()) {
      engine.stop();
      setLocalIsPlaying(false);
      return;
    }
    Promise.resolve(engine.play())
      .then(() => setLocalIsPlaying(true))
      .catch(() => setLocalIsPlaying(false));
  }, [engine, onToggleTransport]);

  const anySolo = tracks.some((track) => Boolean(track.solo));
  const isOverlay = variant === "overlay";

  return (
    <div
      data-testid="hardware-console"
      data-console-variant={variant}
      className={
        isOverlay
          ? "mx-auto w-full max-w-[1680px] space-y-4 px-3 pb-6 pt-3 sm:px-5"
          : "mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-6 space-y-4"
      }
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-0.5">
          <h1 className="font-['Space_Grotesk'] text-lg font-bold text-text sm:text-xl">
            {t("console_title")}
          </h1>
          <p className="text-[11px] text-text-sub sm:text-xs">
            {isOverlay ? t("console_float_shared_hint") : t("console_subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 font-['JetBrains_Mono'] text-[10px] text-text-sub">
            {t("console_channel_count", { count: tracks.length })}
          </span>
          {isOverlay && (
            <span className="hidden rounded-lg border border-line bg-panel2 px-2.5 py-1 font-['JetBrains_Mono'] text-[10px] text-text-dim md:inline">
              {t("console_float_esc_hint")}
            </span>
          )}
          <button
            type="button"
            data-testid="console-spatial-toggle"
            onClick={() => setSpatialEnabled((prev) => !prev)}
            aria-pressed={spatialEnabled}
            title={t("console_spatial_hint")}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] transition-colors ${
              spatialEnabled
                ? "border-accent/60 bg-accent/15 text-accent"
                : "border-line bg-panel2 text-text-sub hover:border-accent/50 hover:text-accent"
            }`}
          >
            <Headphones className="h-3.5 w-3.5" />
            <span>{t("console_spatial_toggle")}</span>
          </button>
          {onOpenStudio && (
            <button
              type="button"
              onClick={onOpenStudio}
              className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[11px] text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
            >
              {t("console_open_studio")}
            </button>
          )}
          {onOpenHelp && (
            <button
              type="button"
              data-testid="console-help-button"
              onClick={onOpenHelp}
              title={t("console_guide_btn")}
              className="flex items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-1.5 text-[11px] text-accent transition-colors hover:bg-accent/20"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>{t("console_guide_btn")}</span>
            </button>
          )}
          {onClose && (
            <button
              type="button"
              data-testid="console-close"
              onClick={onClose}
              aria-label={t("console_float_close")}
              title={t("console_float_close")}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[11px] text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
            >
              <X className="h-3.5 w-3.5" />
              <span>{t("console_float_close")}</span>
            </button>
          )}
        </div>
      </header>

      {tracks.length === 0 ? (
        <EmptyState
          icon={<span className="font-['JetBrains_Mono'] text-lg">▮▮</span>}
          title={t("console_empty_title")}
          description={t("console_empty_desc")}
        />
      ) : (
        <div className="w-full overflow-x-auto pb-4" data-testid="console-desk-scroll">
          <div className="flex min-w-max items-stretch gap-2.5">
            {tracks.map((track, trackIdx) => {
              const visual = getTrackVisual(track.track_id, trackIdx);
              return (
                <ChannelStrip
                  key={`${track.track_id}-${trackIdx}`}
                  trackIdx={trackIdx}
                  name={track.name || visual.label}
                  color={visual.color}
                  volume={track.volume ?? DEFAULT_TRACK_VOLUME}
                  pan={track.pan ?? 0}
                  sendA={track.sendA ?? 0}
                  sendB={track.sendB ?? 0}
                  isMute={Boolean(track.mute)}
                  isSolo={Boolean(track.solo)}
                  isSilenced={Boolean(track.mute) || (anySolo && !track.solo)}
                  t={t}
                  meterLeftRef={channelMeterRefs[trackIdx].left}
                  meterRightRef={channelMeterRefs[trackIdx].right}
                  onVolumeChange={handleVolumeChange}
                  onPanChange={handlePanChange}
                  onSendAChange={handleSendAChange}
                  onSendBChange={handleSendBChange}
                  onToggleMute={handleToggleMute}
                  onToggleSolo={handleToggleSolo}
                  isPhaseInverted={Boolean(track.phaseInvert)}
                  onTogglePhase={handleTogglePhase}
                />
              );
            })}

            <MasterStrip
              volume={masterVolume}
              isPlaying={isPlaying}
              t={t}
              meterLeftRef={masterMeterLeftRef}
              meterRightRef={masterMeterRightRef}
              onVolumeChange={setMasterVolume}
              onToggleTransport={handleToggleTransport}
            />
          </div>
        </div>
      )}

      {tracks.length > 0 && (
        <p className="text-[10px] leading-relaxed text-text-dim md:hidden">
          {t("console_small_screen_hint")}
        </p>
      )}
    </div>
  );
};
