import React, { useState, useEffect, useRef, useMemo } from "react";
import { GenreCover } from "../components/GenreCover";
import { 
  Play, 
  Pause, 
  Square, 
  Sliders, 
  Columns, 
  ArrowLeft, 
  ExternalLink, 
  Sparkles, 
  Clock, 
  MapPin, 
  Music, 
  Disc3, 
  Layers, 
  Headphones, 
  GitCommit, 
  Flame,
  Volume2,
  Radio,
  Activity,
  Users,
  Wrench,
  GitBranch,
  ArrowUpRight,
  Share2
} from "lucide-react";
import { Genre, SequencerTrack } from "../types/genre";
import { GENRES_MAP } from "../data/genres";
import { GENRE_RELATIONS } from "../data/relations";
import { AudioEngine } from "../audio/AudioEngine";
import { patternFromGenre } from "../data/genreMix";
import { useLanguage } from "../i18n/LanguageContext";
import { useAudioEngineInstance } from "../features/sequencer/hooks/useAudioEngineInstance";
import { prepareSamplerLanes, standDownSamplerLanes, type SamplerLaneProgress } from "../audio/samplerLanePrepare";
import { sharedSamplerLoader } from "../audio/sharedSamplerLoader";
import { reportSampledLaneProblems, sampledInstrumentProblems } from "../audio/sampledLanes";
import type { SampleAsset } from "../data/sampleCatalogue";

/**
 * ⭐ **The session's shared loader, as `useRecordedLanes` wants it.** One factory at module scope rather than an inline arrow, so the option
 * object's identity never matters: the hook reads it through a ref, and this is the same function for every render.
 */
const sharedLoaderFor = (catalogue: readonly SampleAsset[], context: BaseAudioContext) => sharedSamplerLoader(context, catalogue);

const getTrackMiniTheme = (track: SequencerTrack, idx: number) => {
  const id = `${track.track_id || ""} ${track.name || ""}`.toLowerCase();
  if (id.includes("kick")) {
    return { activeBg: "bg-amber-500", activeBorder: "border-amber-400", dot: "bg-black" };
  }
  if (id.includes("snare") || id.includes("clap")) {
    return { activeBg: "bg-cyan-400", activeBorder: "border-cyan-300", dot: "bg-black" };
  }
  if (id.includes("hat")) {
    return { activeBg: "bg-yellow-400", activeBorder: "border-yellow-300", dot: "bg-black" };
  }
  if (id.includes("perc") || id.includes("tom") || id.includes("rim")) {
    return { activeBg: "bg-emerald-400", activeBorder: "border-emerald-300", dot: "bg-black" };
  }
  if (id.includes("bass") || id.includes("sub")) {
    return { activeBg: "bg-purple-500", activeBorder: "border-purple-400", dot: "bg-white" };
  }
  if (id.includes("chord") || id.includes("piano") || id.includes("keys")) {
    return { activeBg: "bg-indigo-500", activeBorder: "border-indigo-400", dot: "bg-white" };
  }
  if (id.includes("lead")) {
    return { activeBg: "bg-pink-500", activeBorder: "border-pink-400", dot: "bg-white" };
  }
  return { activeBg: "bg-sky-400", activeBorder: "border-sky-300", dot: "bg-black" };
};

interface GenreDetailViewProps {
  genre: Genre;
  onBack: () => void;
  onSelectGenre: (genre: Genre) => void;
  onOpenStudio: (genre: Genre) => void;
  onAddToCompare: (genre: Genre) => void;
  onForkInMaker?: (genre: Genre) => void;
}

const DRUM_TRACK_IDS = new Set(["kick", "snare", "hihat", "percussion"]);

const isDrumTrack = (track: SequencerTrack, index: number): boolean => {
  if (track.track_id && DRUM_TRACK_IDS.has(track.track_id)) return true;
  const id = `${track.track_id || ""} ${track.name || ""} ${track.instrument || ""}`.toLowerCase();
  const drumKeywords = ["kick", "snare", "clap", "hat", "hihat", "perc", "tom", "rim", "shaker", "cymbal", "ride", "crash", "conga", "bongo"];
  if (drumKeywords.some((k) => id.includes(k))) return true;
  const nonDrumKeywords = ["bass", "sub", "chord", "lead", "synth", "pad", "arp", "organ", "piano", "fx", "vocal"];
  if (nonDrumKeywords.some((k) => id.includes(k))) return false;
  return index < 4;
};

const applyAudioMutes = (engine: AudioEngine, mode: "drums" | "full", genre: Genre) => {
  const tracks = genre.sequencer_pattern?.tracks || [];
  tracks.forEach((track, idx) => {
    const isDrum = isDrumTrack(track, idx);
    const shouldMute = mode === "drums" ? !isDrum : false;
    engine.setTrackState(idx, { mute: shouldMute });
  });
};

// 4-Beat rich color themes for 16-step jumping dots
const BEAT_DOT_COLORS = [
  { active: "bg-amber-400 shadow-[0_0_10px_rgba(245,183,61,0.9)] ring-1 ring-amber-300", beatDot: "bg-amber-500/50" },  // Beat 1 (Amber / Gold)
  { active: "bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.9)] ring-1 ring-cyan-300", beatDot: "bg-cyan-500/50" },       // Beat 2 (Cyan / Aqua)
  { active: "bg-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.9)] ring-1 ring-rose-300", beatDot: "bg-rose-500/50" },       // Beat 3 (Rose / Coral)
  { active: "bg-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.9)] ring-1 ring-purple-300", beatDot: "bg-purple-500/50" }, // Beat 4 (Purple / Violet)
];

export const GenreDetailView: React.FC<GenreDetailViewProps> = ({
  genre,
  onBack,
  onSelectGenre,
  onOpenStudio,
  onAddToCompare,
  onForkInMaker,
}) => {
  const { t, language } = useLanguage();

  // Groove player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [auditionMode, setAuditionMode] = useState<"drums" | "full">("full");
  const [currentStep, setCurrentStep] = useState(0);
  const [bpm, setBpm] = useState(genre.default_bpm || 124);
  const [bpmInput, setBpmInput] = useState<string>(String(genre.default_bpm || 124));
  /**
   * ⭐ **"The recordings this audition needs are still downloading", as a visible state.**
   *
   * `null` means "nothing is being fetched"; a `{loaded,total}` pair means the button has been pressed and the transport has **not** started
   * yet. `loaded` only ever grows and `total` is known before the first request, so the indicator is determinate rather than a spinner —
   * the shape `smplr` documents (*"`total` is known before loading starts, so you can display a determinate progress bar"*,
   * <https://raw.githubusercontent.com/danigb/smplr/main/README.md>).
   */
  const [preparing, setPreparing] = useState<SamplerLaneProgress | null>(null);
  /**
   * ⭐ **Why an audition did not start, or which of its lanes are missing — never a silent wait and never a quiet lane.**
   *
   * The sentences come from `reportSampledLaneProblems`, the one place every playback path's stand-down failures become visible, so this
   * surface reports them in the same words the transport and the other views already use.
   */
  const [samplingProblems, setSamplingProblems] = useState<string[]>([]);
  /**
   * The genre preview engine, owned by `useAudioEngineInstance`.
   *
   * The engine used to be constructed inside the effect below and destroyed in its cleanup, with the
   * effect keyed on `genre` so a genre change rebuilt everything. The hook owns creation and teardown
   * now; the effect keeps only the part that is genuinely about the genre — seeding the pattern, the
   * bpm and the input field — and re-runs on a genre change without any engine bookkeeping.
   */
  const { engineRef, startRecordedLanes, stopRecordedLanes, catalogue } = useAudioEngineInstance(
    {
      onStep: ({ step }) => setCurrentStep(step),
      onStop: () => {
        setIsPlaying(false);
        setCurrentStep(0);
      },
    },
    /**
     * ⭐ **The session's shared loader, so warming the recordings and sounding them are the same download.**
     *
     * `prepareSamplerLanes` fills this loader's caches and `startRecordedLanes` sounds through it, which is what makes the wait a cache hit
     * rather than 45 files fetched twice — see `src/audio/sharedSamplerLoader.ts` for the measurement.
     */
    { loaderFor: sharedLoaderFor }
  );

  // Seed the preview from the genre. The engine's own lifecycle is the hook's business now.
  useEffect(() => {
    const defaultBpm = genre.default_bpm || 124;
    setBpm(defaultBpm);
    setBpmInput(String(defaultBpm));

    const engine = engineRef.current;
    if (!engine) return;
    engine.setPattern(patternFromGenre(genre), true);
    engine.setBpm(defaultBpm);
  }, [genre, engineRef]);

  /**
   * ⭐ **"This lane is a recording this build cannot serve" — said before anyone presses play.**
   *
   * The owner's rule is *"a recording by default, and a synthesiser when the recording is not there"*, and a mirror that is not configured makes
   * that fallback apply to **every** mapped lane at once. Left unsaid, that is a genre page whose promised saxophone is a synthesiser and
   * nothing on screen explaining it — so the sentences `sampledInstrumentProblems` produces (the same ones every playback path reports) are
   * rendered here as soon as the catalogue answers, rather than waiting for a press that would otherwise look like a bug.
   */
  useEffect(() => {
    if (catalogue === null) return;
    const gaps = sampledInstrumentProblems(patternFromGenre(genre), catalogue);
    if (gaps.length > 0) setSamplingProblems(reportSampledLaneProblems(gaps));
  }, [catalogue, genre]);

  const handlePlayMode = async (mode: "drums" | "full") => {
    if (!engineRef.current) return;

    // If clicking same mode while playing, stop
    if (isPlaying && auditionMode === mode) {
      engineRef.current.stop();
      stopRecordedLanes();
      setIsPlaying(false);
      return;
    }

    // If currently playing in the other mode, switch mutes in realtime without interruption
    if (isPlaying && auditionMode !== mode) {
      setAuditionMode(mode);
      applyAudioMutes(engineRef.current, mode, genre);
      /**
       * ⭐ **A mode switch re-plans the recorded lanes, because the mutes just changed.**
       *
       * "Audition Drums Only" mutes the non-drum lanes on the engine, and the recorded lanes are placed by a scheduler
       * the engine's mute state cannot silence — so without this the bass and the piano would keep sounding over a mode
       * whose whole promise is that they are silent. `startRecordedLanes` reads the mute state and re-plans from it,
       * which is the same audibility rule `playArrangementV2` applies. Nothing is fetched again: the session's loader
       * already holds every recording this pattern names.
       */
      void startRecordedLanes(patternFromGenre(genre));
      return;
    }

    /**
     * ⭐ **Ready first, then the transport — the order the owner asked for, and the order that puts the notes in the right place.**
     *
     * The recorded lanes are **stood down** in the engine (`prepareSampledLanes`) and sounded from their own bytes by a scheduler that
     * `await`s a fetch and a decode for every note. Starting the transport first therefore opens the bar with those lanes *missing*, and
     * when the bytes arrive every onset whose time has already passed starts at once — the "先静音后补" burst this view used to play.
     * So the recordings are warmed **before** `play()`, through the very loader the scheduler will use, and the wait is shown.
     *
     * ⚠️ **A failure is visible and does not hang.** If nothing could be prepared while there was something to prepare, the audition does
     * not start and the reasons are rendered below; if only some lanes failed, the audition starts and the missing ones are named. Neither
     * branch is a silent wait, and neither is a silent lanes-are-quiet-for-no-reason.
     */
    const pattern = patternFromGenre(genre);
    const engine = engineRef.current;
    const context: BaseAudioContext | null = engine.audioContext ?? null;
    const assets = catalogue ?? [];
    const loader = context ? sharedLoaderFor(assets, context) : null;
    setSamplingProblems([]);
    setPreparing(null);
    if (loader) {
      const preparation = await prepareSamplerLanes({
        pattern,
        catalogue: assets,
        loader,
        bpm: engine.getBpm(),
        /**
         * ⭐ **Exactly the lanes the stand-down will silence** — `sampledStandDownIndexes`, the function `AudioEngine.prepareSampledLanes`
         * itself uses, reached through `standDownSamplerLanes`. A lane the catalogue does not serve keeps its synthesiser and will be heard
         * however slow the network is, so waiting for it would be waiting for nothing; a lane it does serve is the one that would open the
         * bar silent. With no catalogue at all, this list is empty and nothing is fetched.
         */
        lanes: standDownSamplerLanes(pattern, assets),
        /**
         * `total: 0` is the ordinary case for a genre with no mapped lane, and a progress display that flashed "0 / 0" for it would be a
         * lie about work that never happened — so the indicator is only raised when there is something to wait for.
         */
        onProgress: (progress) => setPreparing(progress.total > 0 ? progress : null),
      });
      setPreparing(null);
      if (preparation.problems.length > 0) setSamplingProblems(reportSampledLaneProblems(preparation.problems));
      if (!preparation.ready && !preparation.empty) {
        setIsPlaying(false);
        return;
      }
      if (!engineRef.current) return;
    }

    setAuditionMode(mode);
    applyAudioMutes(engineRef.current, mode, genre);
    /**
     * **The transport, then the lanes — now on one grid because the bytes are already here.** `play()` resumes the context and starts
     * the engine's own grid; the scheduler places its notes on that same clock, and with the loader warm that placement is a cache hit
     * rather than a download, so a note's onset is where the step says it is.
     */
    await engineRef.current.play();
    void startRecordedLanes(pattern);
    setIsPlaying(true);
  };

  const handleStop = () => {
    if (!engineRef.current) return;
    engineRef.current.stop();
    stopRecordedLanes();
    setIsPlaying(false);
    setCurrentStep(0);
    setPreparing(null);
  };

  const handleBpmChange = (newBpm: number) => {
    const clamped = Math.max(40, Math.min(260, newBpm));
    setBpm(clamped);
    setBpmInput(String(clamped));
    if (engineRef.current) {
      engineRef.current.setBpm(clamped);
    }
  };

  // Analyze step hits per instrument to drive colorful animation
  const stepInfo = useMemo(() => {
    const tracks = genre.sequencer_pattern?.tracks || [];
    const info = Array.from({ length: 16 }, () => ({
      hasKick: false,
      hasSnare: false,
      hasHihat: false,
      hasPerc: false,
      hasBass: false,
      totalHits: 0,
    }));

    tracks.forEach((track, idx) => {
      const isDrum = isDrumTrack(track, idx);
      const id = `${track.track_id || ""} ${track.name || ""}`.toLowerCase();
      const isKick = id.includes("kick");
      const isSnare = id.includes("snare") || id.includes("clap");
      const isHihat = id.includes("hat") || id.includes("hihat");
      const isPerc = isDrum && !isKick && !isSnare && !isHihat;
      const isBass = id.includes("bass") || id.includes("sub");

      const steps = track.steps || [];
      for (let s = 0; s < 16; s++) {
        const stepIdx = steps.length > 0 ? s % steps.length : s;
        if (steps[stepIdx] > 0) {
          info[s].totalHits += 1;
          if (isKick) info[s].hasKick = true;
          if (isSnare) info[s].hasSnare = true;
          if (isHihat) info[s].hasHihat = true;
          if (isPerc) info[s].hasPerc = true;
          if (isBass) info[s].hasBass = true;
        }
      }
    });

    return info;
  }, [genre]);

  const currentHits = stepInfo[currentStep] || {
    hasKick: false,
    hasSnare: false,
    hasHihat: false,
    hasPerc: false,
    hasBass: false,
  };

  // Reverse query GENRE_RELATIONS for genealogy & connections (P3-15, Decision D2-A)
  const relatedRelations = useMemo(() => {
    const inbound = GENRE_RELATIONS.filter((r) => r.target === genre.id);
    const outbound = GENRE_RELATIONS.filter((r) => r.source === genre.id);

    const parentIds = new Set<string>(genre.parent_genres || []);
    inbound.forEach((r) => {
      if (r.type === "origin_from" || r.type === "derived_to") parentIds.add(r.source);
    });

    const subgenreIds = new Set<string>(genre.subgenres || []);
    outbound.forEach((r) => {
      if (r.type === "derived_to" || r.type === "origin_from") subgenreIds.add(r.target);
    });

    const relatedIds = new Set<string>(genre.related_genres || []);
    [...inbound, ...outbound].forEach((r) => {
      const otherId = r.source === genre.id ? r.target : r.source;
      if (!parentIds.has(otherId) && !subgenreIds.has(otherId) && otherId !== genre.id) {
        relatedIds.add(otherId);
      }
    });

    const descriptions: Record<string, { type: string; desc: string }> = {};
    [...inbound, ...outbound].forEach((r) => {
      const otherId = r.source === genre.id ? r.target : r.source;
      if (r.description && r.description[language]) {
        descriptions[otherId] = {
          type: r.type,
          desc: r.description[language],
        };
      }
    });

    return {
      parents: Array.from(parentIds)
        .map((id) => GENRES_MAP[id] || ({ id, name: id } as Genre))
        .filter(Boolean),
      subgenres: Array.from(subgenreIds)
        .map((id) => GENRES_MAP[id] || ({ id, name: id } as Genre))
        .filter(Boolean),
      related: Array.from(relatedIds)
        .map((id) => GENRES_MAP[id] || ({ id, name: id } as Genre))
        .filter(Boolean),
      descriptions,
    };
  }, [genre, language]);

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-1.5 text-xs text-text-sub hover:text-text transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{t("back")}</span>
      </button>

      {/* Hero Header Banner */}
      <div className="bg-panel border border-line rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Ambient background glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-600/30 text-accent border border-indigo-500/30">
                {genre.category}
              </span>
              {genre.aliases.map((alias) => (
                <span
                  key={alias}
                  className="text-xs px-2.5 py-1 rounded-full bg-neutral-800 text-[#b9b7b0] border border-line-strong"
                >
                  {alias}
                </span>
              ))}
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold text-text tracking-tight">
              {genre.name}
            </h1>

            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[#b9b7b0] pt-1">
              <div className="flex items-center space-x-1.5 text-amber-400">
                <Clock className="w-4 h-4" />
                <span className="font-semibold">{genre.origin_year}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-sky-400">
                <MapPin className="w-4 h-4" />
                <span className="font-semibold">{genre.origin_place[language]}</span>
              </div>
              <div className="flex items-center space-x-1.5 text-emerald-400">
                <Music className="w-4 h-4" />
                <span className="font-semibold">{genre.bpm_range} BPM</span>
              </div>
              <div className="flex items-center space-x-1.5 text-purple-400">
                <Disc3 className="w-4 h-4" />
                <span className="font-semibold">{genre.time_signature} Time</span>
              </div>
            </div>
          </div>

          {/* The genre's own artwork, in the skin the reader has chosen. Hidden on narrow widths, where the title
              block needs the room more than the picture does. */}
          <div className="hidden md:block shrink-0">
            <GenreCover
              genreId={genre.id}
              testId={`genre-detail-cover-${genre.id}`}
              className="h-40 w-40 rounded-2xl object-cover ring-1 ring-line shadow-2xl"
            />
          </div>

          {/* Call to Actions */}
          <div className="flex flex-wrap md:flex-col gap-2.5 shrink-0">
            <button
              onClick={() => onOpenStudio(genre)}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-5 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-text font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all hover:scale-105"
            >
              <Sliders className="w-4 h-4" />
              <span>{t("open_in_studio")}</span>
            </button>

            <button
              onClick={() => onAddToCompare(genre)}
              className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl bg-neutral-800 hover:bg-neutral-700 text-text font-semibold text-xs border border-line-strong transition-colors"
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{t("compare_add")}</span>
            </button>

            {onForkInMaker && (
              <button
                onClick={() => onForkInMaker(genre)}
                className="flex-1 md:flex-initial flex items-center justify-center space-x-2 px-4 py-2.5 rounded-2xl bg-accent/15 hover:bg-accent/25 text-accent font-semibold text-xs border border-accent/30 transition-colors"
                title={t("fork_in_maker")}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{t("fork_in_maker")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Groove Audition Bar: Dual Mode (Full Band & Drums Only) with Rich Colorful Spectrum */}
      <div className="bg-panel border border-line rounded-3xl p-6 sm:p-7 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-accent" />
              <h2 className="font-bold text-text text-lg sm:text-xl tracking-wide">
                {t("detail_groove_audition")}
              </h2>
              <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30">
                {genre.sequencer_pattern?.scale || "C Minor"}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-text-sub mt-1">
              {t("detail_groove_audition_subtitle")}
            </p>
          </div>

          {/* Tempo Controls & Stop */}
          <div className="flex items-center space-x-3 self-start sm:self-auto">
            <div className="flex items-center space-x-2 bg-panel2 px-3.5 py-2 rounded-2xl border border-line text-xs font-mono text-[#b9b7b0]">
              <span className="text-text-dim font-bold">BPM</span>
              <button
                onClick={() => handleBpmChange(bpm - 2)}
                className="w-5 h-5 rounded bg-[#181a20] hover:bg-[#252834] text-text font-bold flex items-center justify-center transition-colors"
                title="Decrease BPM"
              >
                -
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={bpmInput}
                onChange={(e) => {
                  setBpmInput(e.target.value);
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val) && val >= 40 && val <= 260) {
                    setBpm(val);
                    if (engineRef.current) engineRef.current.setBpm(val);
                  }
                }}
                onBlur={() => {
                  const val = parseInt(bpmInput, 10);
                  const finalBpm = isNaN(val) ? (genre.default_bpm || 124) : Math.max(40, Math.min(260, val));
                  handleBpmChange(finalBpm);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className="w-12 bg-transparent text-text font-bold text-center focus:outline-none"
              />
              <button
                onClick={() => handleBpmChange(bpm + 2)}
                className="w-5 h-5 rounded bg-[#181a20] hover:bg-[#252834] text-text font-bold flex items-center justify-center transition-colors"
                title="Increase BPM"
              >
                +
              </button>
            </div>

            {isPlaying && (
              <button
                onClick={handleStop}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 font-bold text-xs transition-colors border border-red-500/30"
                title={t("stop")}
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>{t("stop")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Dual Audition Action Buttons: Full Band & Drums Only */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          {/* Full Band Audition Button */}
          <button
            onClick={() => void handlePlayMode("full")}
            className={`flex items-center justify-center space-x-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all shadow-md ${
              isPlaying && auditionMode === "full"
                ? "bg-accent text-black shadow-[0_0_20px_rgba(245,183,61,0.4)] ring-2 ring-amber-400/50"
                : "bg-[#161820] hover:bg-[#20232c] text-text border border-[#2b2e38] hover:border-accent/50"
            }`}
          >
            {isPlaying && auditionMode === "full" ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>{t("detail_stop_full")}</span>
                <div className="flex items-end gap-0.5 h-3.5 ml-1.5">
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                  <span className="w-1 h-2 bg-black rounded-full animate-ping" />
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-accent" />
                <span>{t("detail_audition_full")}</span>
              </>
            )}
          </button>

          {/* Drums Only Audition Button */}
          <button
            onClick={() => void handlePlayMode("drums")}
            className={`flex items-center justify-center space-x-2.5 py-3.5 px-5 rounded-2xl font-bold text-sm transition-all shadow-md ${
              isPlaying && auditionMode === "drums"
                ? "bg-accent text-black shadow-[0_0_20px_rgba(245,183,61,0.4)] ring-2 ring-amber-400/50"
                : "bg-[#161820] hover:bg-[#20232c] text-text border border-[#2b2e38] hover:border-accent/50"
            }`}
          >
            {isPlaying && auditionMode === "drums" ? (
              <>
                <Square className="w-4 h-4 fill-current" />
                <span>{t("detail_stop_drums")}</span>
                <div className="flex items-end gap-0.5 h-3.5 ml-1.5">
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                  <span className="w-1 h-2 bg-black rounded-full animate-ping" />
                  <span className="w-1 h-3.5 bg-black rounded-full animate-pulse" />
                </div>
              </>
            ) : (
              <>
                <Disc3 className="w-4 h-4 text-accent" />
                <span>{t("detail_audition_drums")}</span>
              </>
            )}
          </button>
        </div>

        {/**
         * ⭐ **"正在获取音源" — the wait, said out loud, with a determinate count.**
         *
         * It sits directly under the two audition buttons because that is where the press happened, and it replaces the transport's own status
         * while it is up: a bar that claims to be playing while nothing has been scheduled yet is the "control that lies" this repository keeps
         * removing. `total` is known before the first request, so the number is a fact rather than an animation.
         */}
        {preparing && (
          <div
            role="status"
            aria-live="polite"
            data-testid="sampler-loading"
            className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-[#0c0d11] border border-accent/40"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-accent animate-pulse shadow-[0_0_10px_#f5b73d]" />
            <span className="text-xs sm:text-sm font-bold text-[#f0ede6]">{t("detail_sampling_loading")}</span>
            <span className="ml-auto font-mono text-xs text-accent">
              {t("detail_sampling_progress", { loaded: preparing.loaded, total: preparing.total })}
            </span>
            <span className="w-24 h-1.5 rounded-full bg-neutral-800 overflow-hidden" aria-hidden="true">
              <span
                className="block h-full bg-accent transition-[width] duration-200"
                style={{ width: `${preparing.total > 0 ? Math.round((preparing.loaded / preparing.total) * 100) : 0}%` }}
              />
            </span>
          </div>
        )}

        {/**
         * ⭐ **A failure is a sentence, not silence.** Nothing here is a "try again silently" and nothing is a lane that is quiet for no stated
         * reason: every line names a lane and a cause, and these are the same sentences every other playback path logs.
         */}
        {samplingProblems.length > 0 && (
          <div
            role="alert"
            data-testid="sampler-problems"
            className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/40 space-y-1"
          >
            <p className="text-xs font-bold text-red-300">{t("detail_sampling_problem")}</p>
            <ul className="space-y-0.5">
              {samplingProblems.map((problem) => (
                <li key={problem} className="font-mono text-[11px] text-red-200/90 break-all">
                  {problem}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Dynamic Multi-color Beat Spectrum & Status Console (No blank space, rich color transitions) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-[#0c0d11] border border-line space-y-3.5">
          {/* Status Bar & Active Channels Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2.5">
              <span className={`w-2.5 h-2.5 rounded-full ${isPlaying ? "bg-accent shadow-[0_0_10px_#f5b73d] animate-pulse" : preparing ? "bg-accent/60 animate-pulse" : "bg-neutral-700"}`} />
              <span className="font-bold text-sm text-[#f0ede6]">
                {isPlaying
                  ? (auditionMode === "drums"
                      ? t("detail_status_drums")
                      : t("detail_status_full"))
                  : preparing
                    ? t("detail_sampling_loading")
                    : t("detail_status_ready")}
              </span>
            </div>

            {/* Beat Readout & Measure Counter with Colorful Jumping Dots */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-[#14161e] border border-[#282c38] text-xs font-bold text-accent">
                BEAT {Math.floor(currentStep / 4) + 1} / 4
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-[#14161e] border border-[#282c38] text-xs font-bold text-[#06b6d4]">
                STEP {currentStep + 1} / 16
              </span>

              {/* 16-Step Animated Jumping Dots with 4-Beat Color Palette */}
              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#07080a] border border-[#1b1e26] h-[28px]">
                {Array.from({ length: 16 }).map((_, stepIdx) => {
                  const isActive = isPlaying && currentStep === stepIdx;
                  const isBeatStart = stepIdx % 4 === 0;
                  const beatIdx = Math.floor(stepIdx / 4);
                  const theme = BEAT_DOT_COLORS[beatIdx];

                  return (
                    <div
                      key={stepIdx}
                      className={`transition-all duration-75 ${
                        stepIdx % 4 === 3 && stepIdx !== 15 ? "mr-1.5" : ""
                      } ${
                        isActive
                          ? `w-3 h-2 rounded-full -translate-y-0.5 scale-110 ${theme.active}`
                          : isBeatStart
                          ? `w-2 h-2 rounded-full ${theme.beatDot}`
                          : "w-1.5 h-1.5 rounded-full bg-[#1b1e26]"
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Active Instrument Trigger Badges Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-[#181a22] text-[11px]">
            <span className="text-text-dim font-semibold tracking-wider uppercase font-mono text-[10px]">
              CHANNELS:
            </span>
            <div className="flex flex-wrap items-center gap-2 font-mono">
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasKick 
                  ? "bg-amber-500/25 border-amber-400 text-amber-300 shadow-[0_0_8px_rgba(245,183,61,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-text-dim"
              }`}>
                KICK
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasSnare 
                  ? "bg-cyan-500/25 border-cyan-400 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-text-dim"
              }`}>
                SNARE
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasHihat 
                  ? "bg-yellow-500/25 border-yellow-400 text-yellow-300 shadow-[0_0_8px_rgba(234,179,8,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-text-dim"
              }`}>
                HI-HAT
              </span>
              <span className={`px-2 py-0.5 rounded-md border transition-all ${
                isPlaying && currentHits.hasPerc 
                  ? "bg-emerald-500/25 border-emerald-400 text-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.5)] font-bold scale-105" 
                  : "bg-[#12141a] border-[#222632] text-text-dim"
              }`}>
                PERC
              </span>
              {auditionMode === "full" && (
                <span className={`px-2 py-0.5 rounded-md border transition-all ${
                  isPlaying && currentHits.hasBass 
                    ? "bg-purple-500/25 border-purple-400 text-purple-300 shadow-[0_0_8px_rgba(168,85,247,0.5)] font-bold scale-105" 
                    : "bg-[#12141a] border-[#222632] text-text-dim"
                }`}>
                  BASS
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* P3-16 Embedded 8-Track Mini Step Sequencer Matrix */}
      <div className="bg-panel border border-line rounded-3xl p-5 sm:p-7 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-line-subtle pb-3">
          <div className="flex items-center space-x-2">
            <Sliders className="w-5 h-5 text-accent" />
            <h3 className="font-bold text-text text-base sm:text-lg">
              {t("mini_sequencer_title")}
            </h3>
            <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-accent/15 text-accent border border-accent/30 font-semibold">
              {genre.sequencer_pattern?.totalSteps || 16} Steps · {genre.sequencer_pattern?.tracks?.length || 0} Tracks
            </span>
          </div>

          <button
            onClick={() => onOpenStudio(genre)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-text text-xs font-bold shadow-lg shadow-indigo-600/20 transition-all self-start sm:self-auto hover:scale-105"
            title={t("mini_sequencer_open_studio")}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>{t("mini_sequencer_open_studio")}</span>
            <ExternalLink className="w-3.5 h-3.5 ml-0.5" />
          </button>
        </div>

        {/* 8-Track Grid Rows */}
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[620px] space-y-1.5">
            {/* Header step numbers */}
            <div className="flex items-center pl-28 pr-1 text-[10px] font-mono text-text-dim">
              {Array.from({ length: 16 }).map((_, stepIdx) => (
                <div
                  key={stepIdx}
                  className={`flex-1 text-center font-bold ${
                    stepIdx % 4 === 0 ? "text-accent font-black" : "text-text-dim"
                  } ${stepIdx % 4 === 3 && stepIdx !== 15 ? "mr-1.5" : ""}`}
                >
                  {stepIdx + 1}
                </div>
              ))}
            </div>

            {/* Track rows */}
            {(genre.sequencer_pattern?.tracks || []).map((track, trackIdx) => {
              const trackTheme = getTrackMiniTheme(track, trackIdx);
              const steps = track.steps || [];

              return (
                <div
                  key={track.track_id || trackIdx}
                  className="flex items-center gap-2 py-1 px-2.5 rounded-xl bg-panel2/60 border border-line-subtle hover:border-line transition-colors"
                >
                  {/* Track label */}
                  <div className="w-24 shrink-0 flex flex-col justify-center">
                    <span className="text-xs font-bold text-text truncate">
                      {track.name}
                    </span>
                    <span className="text-[10px] text-text-dim font-mono truncate">
                      {track.instrument}
                    </span>
                  </div>

                  {/* 16 Step cells */}
                  <div className="flex-1 flex items-center gap-1">
                    {Array.from({ length: 16 }).map((_, sIdx) => {
                      const stepVal = steps[sIdx % (steps.length || 16)] || 0;
                      const isActiveStep = isPlaying && currentStep === sIdx;
                      const isBeatStart = sIdx % 4 === 0;

                      return (
                        <div
                          key={sIdx}
                          className={`flex-1 h-7 rounded-md flex items-center justify-center transition-all ${
                            sIdx % 4 === 3 && sIdx !== 15 ? "mr-1.5" : ""
                          } ${
                            isActiveStep
                              ? "ring-2 ring-white scale-105 z-10 brightness-125"
                              : ""
                          } ${
                            stepVal > 0
                              ? `${trackTheme.activeBg} border ${trackTheme.activeBorder} shadow-xs`
                              : isBeatStart
                              ? "bg-[#161822] border border-[#262a3a]"
                              : "bg-[#0d0e13] border border-[#1b1d26]"
                          }`}
                          title={`${track.name} - Step ${sIdx + 1} (${stepVal > 0 ? "Active" : "Off"})`}
                        >
                          {stepVal > 0 && (
                            <span className={`w-1.5 h-1.5 rounded-full ${trackTheme.dot} shadow-xs`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Production Guide & Dossier Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: History & Culture */}
        <div className="lg:col-span-2 space-y-6">
          {/* Cultural Context */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-3">
            <h3 className="font-bold text-text text-base flex items-center space-x-2">
              <Flame className="w-4 h-4 text-amber-400" />
              <span>{t("culture_background")}</span>
            </h3>
            <p className="text-sm text-[#b9b7b0] leading-relaxed">
              {genre.cultural_context[language]}
            </p>
          </div>

          {/* Drum & Rhythm Architecture */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-text text-base flex items-center space-x-2">
              <Layers className="w-4 h-4 text-accent" />
              <span>{t("drum_features")}</span>
            </h3>

            {/* Core Rhythm Features / DNA Summary */}
            {genre.rhythm_features && (
              <div className="p-3.5 bg-amber-500/10 rounded-2xl border border-amber-500/30 space-y-1">
                <span className="font-bold text-accent uppercase tracking-wider text-[10px]">
                  {t("rhythm_features")}
                </span>
                <p className="text-[#f3f1ec] text-xs leading-relaxed font-sans">
                  {genre.rhythm_features[language]}
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-text-sub uppercase tracking-wider text-[10px]">
                  {t("kick_placement")}
                </span>
                <p className="text-text leading-relaxed">
                  {genre.drum_pattern.kick[language]}
                </p>
              </div>

              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-text-sub uppercase tracking-wider text-[10px]">
                  {t("snare_placement")}
                </span>
                <p className="text-text leading-relaxed">
                  {genre.drum_pattern.snare_clap[language]}
                </p>
              </div>

              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-text-sub uppercase tracking-wider text-[10px]">
                  {t("hihat_pattern")}
                </span>
                <p className="text-text leading-relaxed">
                  {genre.drum_pattern.hihats[language]}
                </p>
              </div>

              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-text-sub uppercase tracking-wider text-[10px]">
                  {t("bass_design")}
                </span>
                <p className="text-text leading-relaxed">
                  {genre.bass_pattern[language]}
                </p>
              </div>

              {genre.drum_pattern.percussion && (
                <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1 sm:col-span-2">
                  <span className="font-bold text-text-sub uppercase tracking-wider text-[10px]">
                    {t("detail_percussion")}
                  </span>
                  <p className="text-text leading-relaxed">
                    {genre.drum_pattern.percussion[language]}
                  </p>
                </div>
              )}

              {/* P3-14 Drum Pattern Swing & Tempo Feel */}
              {genre.drum_pattern.swing && (
                <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                  <span className="font-bold text-amber-300 uppercase tracking-wider text-[10px]">
                    {t("drum_swing")}
                  </span>
                  <p className="text-text leading-relaxed">
                    {genre.drum_pattern.swing[language]}
                  </p>
                </div>
              )}

              {genre.drum_pattern.tempo && (
                <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                  <span className="font-bold text-cyan-300 uppercase tracking-wider text-[10px]">
                    {t("drum_tempo")}
                  </span>
                  <p className="text-text leading-relaxed font-mono font-bold">
                    {genre.drum_pattern.tempo}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sound Design & Production Tips */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-text text-base flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-pink-400" />
              <span>{t("sound_design_tips")}</span>
            </h3>

            {/* Sound Design Deep Dive */}
            {genre.sound_design && (
              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-accent uppercase tracking-wider text-[10px]">
                  {t("sound_design")}
                </span>
                <p className="text-text leading-relaxed text-xs">
                  {genre.sound_design[language]}
                </p>
              </div>
            )}

            {/* Chord Inversions & Voicings */}
            {genre.chord_inversions && (
              <div className="p-3.5 bg-panel2/70 rounded-2xl border border-line/70 space-y-1">
                <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">
                  {t("chord_inversions")}
                </span>
                <p className="text-text leading-relaxed text-xs">
                  {genre.chord_inversions[language]}
                </p>
              </div>
            )}

            {/* Key characteristics & Harmonic progression rules */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-text-sub block">
                {t("harmonic_rules")}
              </span>
              <p className="text-sm text-[#b9b7b0] leading-relaxed">
                {genre.key_characteristics[language]}
              </p>

              {genre.common_chords.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {genre.common_chords.map((chord, i) => (
                    <span
                      key={i}
                      className="px-2.5 py-1 rounded-xl bg-panel2 text-indigo-300 font-mono text-xs border border-line"
                    >
                      {chord}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Practical Production Tips List */}
            {genre.production_tips && genre.production_tips[language] && genre.production_tips[language].length > 0 && (
              <div className="pt-2 border-t border-[#1a1c22] space-y-2">
                <span className="text-xs font-semibold text-text-sub block">
                  {t("detail_pro_tips")}
                </span>
                <ul className="space-y-1.5 text-xs text-[#b8b5ad]">
                  {genre.production_tips[language].map((tip, tIdx) => (
                    <li key={tIdx} className="flex items-start space-x-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0 mt-1.5" />
                      <span className="leading-relaxed">{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Instrumentation & Arrangement Structure (PRD 5.6.1.2) */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-text text-base flex items-center space-x-2">
              <Wrench className="w-4 h-4 text-emerald-400" />
              <span>{t("detail_instruments_structure")}</span>
            </h3>

            {/* Instruments */}
            {genre.instrumentation && genre.instrumentation.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-text-sub uppercase tracking-wider block">
                  {t("instrumentation")}
                </span>
                <div className="flex flex-wrap gap-2">
                  {genre.instrumentation.map((inst, i) => (
                    <span
                      key={i}
                      className="px-3 py-1 rounded-xl bg-panel2 text-emerald-300 font-mono text-xs border border-emerald-500/30 font-semibold"
                    >
                      {inst}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Arrangement Structure */}
            {genre.structure && genre.structure.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#1a1c22]">
                <span className="text-xs font-semibold text-text-sub uppercase tracking-wider block">
                  {t("structure")}
                </span>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                  {genre.structure.map((part, pIdx) => (
                    <React.Fragment key={pIdx}>
                      <span className="px-2.5 py-1 rounded-lg bg-panel2 text-[#c4c7cf] border border-line">
                        {part}
                      </span>
                      {pIdx < genre.structure.length - 1 && (
                        <span className="text-zinc-600 font-bold">→</span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Tracks & Family Tree */}
        <div className="space-y-6">
          {/* Milestone Tracks */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-text text-base flex items-center space-x-2">
              <Headphones className="w-4 h-4 text-sky-400" />
              <span>{t("representative_tracks")}</span>
            </h3>

            <div className="space-y-2.5">
              {genre.representative_tracks.map((track, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-2xl bg-panel2 border border-line-subtle flex items-center justify-between hover:border-line-strong transition-colors"
                >
                  <div className="min-w-0 pr-2">
                    <h5 className="font-bold text-text text-xs truncate">
                      {track.title}
                    </h5>
                    <p className="text-[11px] text-text-sub truncate mt-0.5">
                      {track.artist} • <span className="font-mono">{track.year}</span>
                    </p>
                  </div>

                  {track.link && (
                    <a
                      href={track.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-xl bg-panel hover:bg-indigo-600 text-text-sub hover:text-text transition-colors shrink-0"
                      title={t("listen_link")}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Pioneering Artists */}
          {genre.representative_artists && genre.representative_artists.length > 0 && (
            <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-3">
              <h3 className="font-bold text-text text-base flex items-center space-x-2">
                <Users className="w-4 h-4 text-amber-300" />
                <span>{t("representative_artists")}</span>
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {genre.representative_artists.map((artist, aIdx) => (
                  <span
                    key={aIdx}
                    className="px-2.5 py-1 rounded-xl bg-panel2 text-[#d4d1c9] border border-line text-xs font-medium"
                  >
                    {artist}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Genealogy & Related Connections (P3-15, Decision D2-A) */}
          <div className="bg-panel border border-line rounded-3xl p-6 shadow-xl space-y-5">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <h3 className="font-bold text-text text-base flex items-center space-x-2">
                <GitCommit className="w-4 h-4 text-purple-400" />
                <span>{t("relation_graph_title")}</span>
              </h3>
              <span className="text-[11px] font-mono text-text-dim">
                {relatedRelations.parents.length + relatedRelations.subgenres.length + relatedRelations.related.length} Connected
              </span>
            </div>

            {/* Mini Visual Network Flow */}
            <div className="p-3.5 bg-[#0e0f14] border border-line-subtle rounded-2xl flex flex-col items-center gap-3">
              {/* Layer 1: Ancestors */}
              {relatedRelations.parents.length > 0 && (
                <div className="w-full flex flex-col items-center space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-amber-400/90 tracking-wider">
                    ↑ {t("relation_type_origin")} ({relatedRelations.parents.length})
                  </span>
                  <div className="flex flex-wrap justify-center gap-1.5 max-h-24 overflow-y-auto">
                    {relatedRelations.parents.slice(0, 6).map((pg) => (
                      <button
                        key={pg.id}
                        onClick={() => pg.category && onSelectGenre(pg)}
                        className="text-[11px] px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 hover:bg-amber-500/25 transition-colors font-medium flex items-center space-x-1"
                        title={pg.name}
                      >
                        <span>{pg.name}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Connecting arrow down */}
              {relatedRelations.parents.length > 0 && (
                <div className="w-0.5 h-4 bg-gradient-to-b from-amber-500/40 to-accent" />
              )}

              {/* Layer 2: Current Genre (Active Central Node) */}
              <div className="px-4 py-2 rounded-2xl bg-accent/20 border-2 border-accent text-accent font-black text-sm tracking-wide shadow-[0_0_15px_rgba(245,183,61,0.3)] flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                <span>{genre.name}</span>
              </div>

              {/* Connecting arrow down */}
              {relatedRelations.subgenres.length > 0 && (
                <div className="w-0.5 h-4 bg-gradient-to-b from-accent to-indigo-500/40" />
              )}

              {/* Layer 3: Subgenres & Derivatives */}
              {relatedRelations.subgenres.length > 0 && (
                <div className="w-full flex flex-col items-center space-y-1">
                  <span className="text-[10px] font-mono uppercase font-bold text-indigo-400/90 tracking-wider">
                    ↓ {t("relation_type_derived")} ({relatedRelations.subgenres.length})
                  </span>
                  <div className="flex flex-wrap justify-center gap-1.5 max-h-28 overflow-y-auto">
                    {relatedRelations.subgenres.slice(0, 8).map((sg) => (
                      <button
                        key={sg.id}
                        onClick={() => sg.category && onSelectGenre(sg)}
                        className="text-[11px] px-2.5 py-1 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/25 transition-colors font-medium flex items-center space-x-1"
                        title={sg.name}
                      >
                        <span>{sg.name}</span>
                        <ArrowUpRight className="w-3 h-3 opacity-60" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Related & Cross Influence Pill List */}
            {relatedRelations.related.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-text-sub uppercase tracking-wider block">
                  {t("relation_type_influenced")} / {t("relation_type_fusion")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {relatedRelations.related.map((rg) => (
                    <button
                      key={rg.id}
                      onClick={() => rg.category && onSelectGenre(rg)}
                      className="text-xs px-2.5 py-1 rounded-xl bg-panel2 hover:bg-neutral-800 text-[#b9b7b0] hover:text-text border border-line transition-colors flex items-center space-x-1"
                    >
                      <span>{rg.name}</span>
                      <Share2 className="w-3 h-3 text-text-dim" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Specific Relationship Context Breakdown */}
            {Object.keys(relatedRelations.descriptions).length > 0 && (
              <div className="space-y-2 pt-2 border-t border-line-subtle">
                <span className="text-[11px] font-bold text-[#8d92a0] uppercase tracking-wider block">
                  {language === "zh" ? "渊源脉络考证" : "Historical Lineage Context"}
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {Object.entries(relatedRelations.descriptions).slice(0, 5).map(([targetId, info]) => {
                    const match = GENRES_MAP[targetId];
                    return (
                      <div
                        key={targetId}
                        onClick={() => match && onSelectGenre(match)}
                        className="p-2 rounded-xl bg-[#111218] border border-[#232632] hover:border-accent/40 text-xs transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-text hover:text-accent">
                            {match ? match.name : targetId}
                          </span>
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.5 rounded bg-panel border border-line text-text-dim">
                            {info.type}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#9ca1af] mt-1 leading-snug">
                          {info.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
