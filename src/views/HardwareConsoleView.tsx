import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Genre } from "../types/genre";
import { AudioEngine } from "../audio/AudioEngine";
import { useLanguage } from "../i18n/LanguageContext";
import { useSequencerStore } from "../features/sequencer/useSequencerStore";
import { getDefaultDrumKitForGenre } from "../utils/trackUtils";
import { EmptyState } from "../ui";
import { Headphones } from "lucide-react";
import { ChannelStrip } from "../components/console/ChannelStrip";
import { MasterStrip } from "../components/console/MasterStrip";
import { getTrackVisual } from "../components/console/trackVisuals";
import {
  followPeak,
  levelAtAge,
  linearToMeterPosition,
  panGains,
  peakFromTimeDomain,
} from "../components/console/meterMath";

interface HardwareConsoleViewProps {
  selectedGenre?: Genre;
  onOpenStudio?: (genre: { id: string }) => void;
}

interface TrackMeterRefs {
  left: React.MutableRefObject<HTMLDivElement | null>;
  right: React.MutableRefObject<HTMLDivElement | null>;
}

const DEFAULT_TRACK_VOLUME = 0.8;

/**
 * N-01 / P8-02 — Hardware Console View.
 *
 * A mixing desk for the current sequencer pattern. The store is the single
 * source of truth: every fader / pan / send / mute / solo control reads the
 * track field and writes back through `commit` (discrete toggles) or
 * `commitCoalesced` (continuous drags), so one gesture is one undo step.
 *
 * Metering: the engine exposes no per-track analyser, only a master stereo pair
 * (`getStereoAnalysers`). The master meter therefore runs on real analyser byte
 * data, and every channel meter is derived from the engine's real
 * `setOnTrackTrigger` callback (peak captured per trigger, scaled by the live
 * engine track volume/pan, then released with peak-meter ballistics). Both are
 * written to the DOM from a single requestAnimationFrame loop, so 60fps
 * metering never re-renders React.
 */
export const HardwareConsoleView: React.FC<HardwareConsoleViewProps> = ({
  selectedGenre: initialGenre,
  onOpenStudio,
}) => {
  const { t } = useLanguage();
  const startingGenre = initialGenre as Genre;

  const { state: seqState, commit, commitCoalesced } = useSequencerStore(startingGenre);
  const { currentGenre, pattern, bpm, swing, timeSignature, resolution } = seqState;
  const tracks = useMemo(() => pattern.tracks.slice(0, 8), [pattern.tracks]);

  const engineRef = useRef<AudioEngine | null>(null);
  // N-02: binaural (HRTF) monitoring toggle. Off by default; the engine rebuilds its
  // channel strips when this changes, so the unused panner model costs no CPU.
  const [spatialEnabled, setSpatialEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Seeded from the engine's persisted level rather than a hard-coded default, so the
  // fader shows the real master level on mount (the engine keeps it in audio settings).
  const [masterVolume, setMasterVolume] = useState(() => engineRef.current?.getMasterVolume() ?? DEFAULT_TRACK_VOLUME);

  // ----- Meter state (refs only: the rAF loop must not trigger renders) -----
  const trackPulseRef = useRef<Array<{ peakL: number; peakR: number; at: number }>>([]);
  const trackCountRef = useRef(0);
  trackCountRef.current = tracks.length;
  const masterMeterLeftRef = useRef<HTMLDivElement | null>(null);
  const masterMeterRightRef = useRef<HTMLDivElement | null>(null);
  const masterPeakRef = useRef({ left: 0, right: 0 });
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

  const pulseTracks = useCallback((trackIndices: number[]) => {
    const engine = engineRef.current;
    if (!engine) return;
    const states = engine.getTrackStates();
    const anySolo = states.some((trackState) => Boolean(trackState?.solo));
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();

    trackIndices.forEach((trackIdx) => {
      const trackState = states[trackIdx] ?? engine.getTrackState(trackIdx);
      const volume = trackState?.volume ?? DEFAULT_TRACK_VOLUME;
      const silenced = Boolean(trackState?.mute) || (anySolo && !trackState?.solo);
      if (silenced) {
        trackPulseRef.current[trackIdx] = { peakL: 0, peakR: 0, at: now };
        return;
      }
      const [leftGain, rightGain] = panGains(trackState?.pan ?? 0);
      trackPulseRef.current[trackIdx] = {
        peakL: volume * leftGain,
        peakR: volume * rightGain,
        at: now,
      };
    });
  }, []);

  const onTrackTriggerRef = useRef(pulseTracks);
  onTrackTriggerRef.current = pulseTracks;
  // Read inside the mount-only effect without making it a dependency.
  const spatialEnabledRef = useRef(spatialEnabled);
  spatialEnabledRef.current = spatialEnabled;

  // ----- Engine lifecycle (mirrors StudioView's StrictMode-safe creation) ---
  useEffect(() => {
    const engine = new AudioEngine({
      onTrackTrigger: (trackIndices) => onTrackTriggerRef.current(trackIndices),
      onStop: () => setIsPlaying(false),
    });
    engine.setSpatialMode(spatialEnabledRef.current);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // ----- Spatial monitoring mode (N-02) -------------------------------------
  useEffect(() => {
    engineRef.current?.setSpatialMode(spatialEnabled);
  }, [spatialEnabled]);

  // ----- Store -> engine sync (audio always matches the console) ------------
  useEffect(() => {
    engineRef.current?.setPattern(pattern);
  }, [pattern]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setBpm(bpm);
    engine.setSwing(swing / 100);
    engine.setTimeSignature(timeSignature);
    engine.setResolution(resolution);
  }, [bpm, swing, timeSignature, resolution]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setLoopRange(seqState.loopRange);
    engine.setMetronome(seqState.isMetronome);
    engine.setCountIn(seqState.isCountIn);
  }, [seqState.loopRange, seqState.isMetronome, seqState.isCountIn]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    tracks.forEach((track, trackIdx) => {
      engine.setTrackState(trackIdx, {
        mute: Boolean(track.mute),
        solo: Boolean(track.solo),
        volume: track.volume ?? DEFAULT_TRACK_VOLUME,
        pan: track.pan ?? 0,
        sendA: track.sendA ?? 0,
        sendB: track.sendB ?? 0,
      });
    });
  }, [tracks]);

  useEffect(() => {
    engineRef.current?.setDrumKit(getDefaultDrumKitForGenre(currentGenre));
  }, [currentGenre]);

  useEffect(() => {
    engineRef.current?.setMasterVolume(masterVolume);
  }, [masterVolume]);

  // The engine is created in a mount effect, so read its persisted level once it exists.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setMasterVolume(engine.getMasterVolume());
  }, []);

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

    const frame = (now: number) => {
      const engine = engineRef.current;
      const stereo = engine?.getStereoAnalysers();
      const peakLeft = readAnalyser(stereo?.left, "left");
      const peakRight = readAnalyser(stereo?.right, "right");
      masterPeakRef.current.left = followPeak(masterPeakRef.current.left, peakLeft);
      masterPeakRef.current.right = followPeak(masterPeakRef.current.right, peakRight);
      applyLevel(masterMeterLeftRef.current, masterPeakRef.current.left);
      applyLevel(masterMeterRightRef.current, masterPeakRef.current.right);

      const channelCount = trackCountRef.current;
      for (let trackIdx = 0; trackIdx < channelCount; trackIdx += 1) {
        const pulse = trackPulseRef.current[trackIdx];
        const refs = channelMeterRefs[trackIdx];
        if (!pulse || !refs) continue;
        const age = now - pulse.at;
        applyLevel(refs.left.current, levelAtAge(pulse.peakL, age));
        applyLevel(refs.right.current, levelAtAge(pulse.peakR, age));
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, [channelMeterRefs]);

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
    const engine = engineRef.current;
    if (!engine) return;
    if (engine.getIsPlaying()) {
      engine.stop();
      setIsPlaying(false);
      return;
    }
    Promise.resolve(engine.play())
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, []);

  const anySolo = tracks.some((track) => Boolean(track.solo));

  return (
    <div
      data-testid="hardware-console"
      className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-6 space-y-4"
    >
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-3">
        <div className="space-y-0.5">
          <h1 className="font-['Space_Grotesk'] text-lg font-bold text-text sm:text-xl">
            {t("console_title")}
          </h1>
          <p className="text-[11px] text-text-sub sm:text-xs">{t("console_subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-lg border border-line bg-panel2 px-2.5 py-1 font-['JetBrains_Mono'] text-[10px] text-text-sub">
            {t("console_channel_count", { count: tracks.length })}
          </span>
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
              onClick={() => onOpenStudio({ id: currentGenre.id })}
              className="rounded-lg border border-line bg-panel2 px-3 py-1.5 text-[11px] text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
            >
              {t("console_open_studio")}
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
        <div className="w-full overflow-x-auto pb-4">
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
