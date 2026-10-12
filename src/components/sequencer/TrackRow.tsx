import { trackColour, type TrackColourRole } from "../../utils/trackColours";
import React, { memo, useMemo } from "react";
import { ChevronDown, ChevronRight, Music2, Play, Sliders, SlidersHorizontal, Wand2 } from "lucide-react";
import { MAX_NOTE_GATE_STEPS, SequencerTrack } from "../../types/genre";
import { StepCell } from "./StepCell";
import { useLanguage } from "../../i18n/LanguageContext";
import { useDeviceCapabilities } from "../../hooks/useDeviceCapabilities";

export type TrackCategory = "drum" | "perc" | "bass" | "chord" | "lead" | "fx";

export function getTrackCategory(trackId: string, name: string): TrackCategory {
  const tid = (trackId || "").toLowerCase();
  const nm = (name || "").toLowerCase();
  if (tid === "kick" || tid === "snare" || nm.includes("kick") || nm.includes("snare")) return "drum";
  if (tid === "hat" || tid === "perc" || nm.includes("hat") || nm.includes("perc") || nm.includes("clap")) return "perc";
  if (tid === "bass" || nm.includes("bass") || nm.includes("808") || nm.includes("sub")) return "bass";
  if (tid === "chord" || nm.includes("chord") || nm.includes("pad") || nm.includes("key")) return "chord";
  if (tid === "lead" || nm.includes("lead") || nm.includes("synth") || nm.includes("melody")) return "lead";
  return "fx";
}

export function getTrackTypeDetails(category: TrackCategory, isZh: boolean) {
  switch (category) {
    case "drum":
      return { label: isZh ? "鼓组" : "DRUM", colourRole: "kick" as TrackColourRole };
    case "perc":
      return { label: isZh ? "打击" : "PERC", colourRole: "hat" as TrackColourRole };
    case "bass":
      return { label: isZh ? "贝斯" : "BASS", colourRole: "bass" as TrackColourRole };
    case "chord":
      return { label: isZh ? "和弦" : "CHORD", colourRole: "chord" as TrackColourRole };
    case "lead":
      return { label: isZh ? "主音" : "LEAD", colourRole: "lead" as TrackColourRole };
    case "fx":
    default:
      return { label: isZh ? "音效" : "FX", colourRole: "fx" as TrackColourRole };
  }
}

export interface TrackMetaConfig {
  id: string;
  name: string;
  sub: { zh: string; en: string };
  /** The lane's colour role; the surface maps it to its own fill/ink tokens. */
  colourRole: TrackColourRole;
}

export interface TrackRowProps {
  track: SequencerTrack;
  trackIdx: number;
  meta: TrackMetaConfig;
  isSolo: boolean;
  isMute: boolean;
  isSilenced: boolean;
  isHatTrack: boolean;
  stepCount: number;
  stepsPerBar: number;
  groupSize: number;
  isVelocityLaneOpen: boolean;
  isVelocityActiveTrack: boolean;
  isZh: boolean;
  onAudition: (trackIdx: number, trackName: string) => void;
  onCycleLength: (trackIdx: number) => void;
  onToggleMute: (trackIdx: number) => void;
  onToggleSolo: (trackIdx: number) => void;
  onChangeVolume: (trackIdx: number, vol: number) => void;
  onOpenVelocity: (trackIdx: number) => void;
  /**
   * Opens the track's detailed configuration panel (mix, insert chain, timbre).
   *
   * Logic-style: clicking the track header itself opens the inspector, and the ▶ button
   * below auditions the sound. The two used to share the header click; auditioning now has
   * its own affordance so the header can do what a DAW header is expected to do.
   */
  onOpenInspector: (trackIdx: number) => void;
  onOpenPianoRoll?: (trackIdx: number) => void;
  /** True while this row is the one the inspector is showing, for selected-row styling. */
  isInspectorOpen?: boolean;
  /**
   * Chord tracks only: how this genre plays its chords (articulation + length multiplier).
   *
   * The engine's chord length is `stepDur × gate × CHORD_BASE_GATE × gateScale`, so without this
   * the grid cannot show why one genre's chords ring three times longer than another's.
   */
  chordArticulation?: { articulation: string; gateScale: number; label: string };
  onShiftTrack: (trackIdx: number, dir: -1 | 1) => void;
  onSmartFill: (trackIdx: number) => void;
  onClearTrack: (trackIdx: number) => void;
  onMoveUp?: (trackIdx: number) => void;
  onMoveDown?: (trackIdx: number) => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onChangePan?: (trackIdx: number, pan: number) => void;
  onChangeSwing?: (trackIdx: number, swing: number) => void;
  isCompact?: boolean;
  onToggleCompact?: (trackIdx: number) => void;
  onSetChordDuration?: (trackIdx: number, gate: number) => void;
}

export const TrackRow = memo<TrackRowProps>(function TrackRow({
  track,
  trackIdx,
  meta,
  isSolo,
  isMute,
  isSilenced,
  isHatTrack,
  stepCount,
  stepsPerBar,
  groupSize,
  isVelocityLaneOpen,
  isVelocityActiveTrack,
  isZh,
  onAudition,
  onCycleLength,
  onToggleMute,
  onToggleSolo,
  onChangeVolume,
  onOpenVelocity,
  onOpenInspector,
  onOpenPianoRoll,
  isInspectorOpen = false,
  chordArticulation,
  onShiftTrack,
  onSmartFill,
  onClearTrack,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onChangePan,
  onChangeSwing,
  isCompact = false,
  onToggleCompact,
  onSetChordDuration,
}) {
  const { t } = useLanguage();
  /**
   * Phone shell: the row keeps one big inspector target plus Mute, and drops the rest (see the
   * header markup below for why each one goes).
   *
   * Read from the capability hook rather than a prop, so this file stays independent of the panel's
   * own phone branches — and *not* from `isCompact`, which is the per-track density toggle: the
   * first version of this change gated on that and silently did nothing on a phone.
   */
  const { isMobile } = useDeviceCapabilities();
  const trackVol = track.volume !== undefined ? track.volume : 0.8;
  const trackPan = track.pan !== undefined ? track.pan : 0;
  const trackLen = track.trackLength || stepCount;
  const typeCategory = getTrackCategory(track.track_id, track.name || meta.name);
  const typeDetails = getTrackTypeDetails(typeCategory, isZh);

  const { sustainMap, sustainHeadSet } = useMemo(() => {
    const map = new Map<
      number,
      {
        isSustainTail: boolean;
        isSustainEnd: boolean;
        sourceStepIdx: number;
        totalSteps: number;
      }
    >();
    const heads = new Set<number>();
    if (!track.steps || track.steps.length === 0) return { sustainMap: map, sustainHeadSet: heads };

    const total = track.steps.length;
    let s = 0;
    while (s < total) {
      const activeS = trackLen > 0 ? s % trackLen : s;
      const stepVal = track.steps[s] !== undefined ? track.steps[s] : (track.steps[activeS] || 0);
      if (stepVal > 0) {
        const rawGate = track.gate?.[s] ?? track.gate?.[activeS] ?? 0.8;
        const effectiveSteps = Math.min(MAX_NOTE_GATE_STEPS, Math.round(rawGate));
        if (effectiveSteps > 1) {
          let span = 1;
          for (let next = s + 1; next < s + effectiveSteps && next < total; next++) {
            const nextActive = trackLen > 0 ? next % trackLen : next;
            const nextVal = track.steps[next] !== undefined ? track.steps[next] : (track.steps[nextActive] || 0);
            if (nextVal > 0) {
              break;
            }
            span++;
          }
          if (span > 1) {
            heads.add(s);
            for (let t = 1; t < span; t++) {
              map.set(s + t, {
                isSustainTail: true,
                isSustainEnd: t === span - 1,
                sourceStepIdx: s,
                totalSteps: span,
              });
            }
          }
        }
      }
      s++;
    }
    return { sustainMap: map, sustainHeadSet: heads };
  }, [track.steps, track.gate, trackLen]);

  return (
    <div
      role="row"
      aria-label={meta.name}
      /**
       * `bg-panel` is not decoration: the row is taller than any of its children, so its own
       * vertical padding is a strip no child can paint. Without a background those strips are
       * transparent, which is what let the grid show through them while it scrolled. `--panel` is
       * the colour already behind them (the sequencer section), so this is invisible at rest and
       * opaque under motion.
       */
      /**
       * `relative z-20` is load-bearing, not decoration.
       *
       * The playhead laser beam is a positioned sibling with `z-index: 15`, and it starts at the
       * first visible step's left edge — a few pixels *inside* the frozen column. Without a stacking
       * context on the row the beam is hit-tested through the column there, which is what the gutter
       * probe reported (99 of 14592 samples, and only when the playhead happened to be at step 0 of
       * the visible window). The row's own `z-index` puts the row, its solid layer and its header
       * above the beam as one unit.
       */
      className={`relative z-20 flex items-center gap-[var(--trk-head-gap)] bg-panel ${isCompact ? "py-0.5 min-h-[var(--step-cell-h-compact)]" : "py-row-y"} landscape-compact-row transition-opacity min-w-max track-row-${trackIdx}`}
      /**
       * Two variables, because a lane is both a shape and a label.
       *
       * `--tc` is the fill (darkened per skin so white-ish note names read on it at 55 % opacity), `--tc-ink` is
       * the readable version for text drawn *on the lane* — a white note name on a light skin's translucent
       * lane tint was the audit's single largest finding (104 per studio view).
       */
      style={{
        ["--tc" as any]: trackColour(meta.colourRole),
        ["--tc-ink" as any]: trackColour(meta.colourRole, "ink"),
      }}
    >
      {/* Solid frozen column: full row height, header width plus the gutter, underneath the header.
          See `.trk-head-solid` in index.css for why the header box alone is not enough. */}
      <div
        aria-hidden="true"
        className="trk-head-solid bg-gradient-to-r from-[#161822] to-[#121319]"
      />

      {/* Track Header (.trk-head) - `--trk-head-w` (142px mobile / 176px sm+) - Sticky Left.
          The width is shared with the ruler label and the velocity lane so the three cannot
          disagree and paint over each other; see the note on `--trk-head-w` in index.css. */}
      <div className={`sticky left-0 z-40 bg-gradient-to-r from-[#161822] to-[#121319] flex-none w-[var(--trk-head-w)] pr-1.5 sm:pr-2 pl-1 flex flex-col justify-center ${
        isCompact ? "min-h-[var(--step-cell-h-compact)] gap-0" : "gap-1"
      } select-none border-r border-line-subtle border-l-[3.5px] border-l-[var(--tc)] shadow-[4px_0_12px_rgba(0,0,0,0.6)] overflow-hidden transition-all ${
        isSilenced && !isMute && !isSolo ? "opacity-60" : "opacity-100"
      }`}>
        {/* Upper row: Fold Toggle + Type Badge + Swatch + LED Peak Meter + Title + Polymeter + Mute / Solo */}
        <div className="flex items-center gap-1 sm:gap-1.5">
          {/**
           * Fold / Unfold Single Track. Desktop and tablet only: measured at 390×664 this button
           * came out **14×14 px**, and a phone already has "Fold All Tracks" in the studio toolbar,
           * so the per-track toggle is the kind of control this shell does not offer rather than
           * shrink.
           */}
          {onToggleCompact && !isMobile && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCompact(trackIdx);
              }}
              data-testid={`track-fold-${trackIdx}`}
              className="w-3.5 h-3.5 flex items-center justify-center text-text-dim hover:text-text shrink-0 cursor-pointer"
              title={isCompact ? t("roll_expand") : t("roll_collapse")}
              aria-label={isCompact ? t("roll_expand") : t("roll_collapse")}
            >
              {isCompact ? <ChevronRight className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
          )}

          {/* Type Badge. Desktop only: at 142 px the phone column cannot hold it plus the
              name plus the five mobile-sized action buttons, and the name already says
              what the track is ("HI-HAT", "KICK"). The badge stays in the DOM for the
              desktop layout and for assistive tech. */}
          <span
            data-testid={`track-type-${trackIdx}`}
            className="font-['JetBrains_Mono'] text-[7.5px] font-black uppercase px-1 py-0.2 rounded tracking-tighter shrink-0 border trk-head-desktop-only"
            style={{
              // The chip tint is the *ink* at low alpha, so it reads on the panel in every skin.
              backgroundColor: `color-mix(in srgb, ${trackColour(typeDetails.colourRole)} 14%, transparent)`,
              borderColor: `color-mix(in srgb, ${trackColour(typeDetails.colourRole)} 34%, transparent)`,
              color: trackColour(typeDetails.colourRole),
            }}
            title={typeDetails.label}
          >
            {typeDetails.label}
          </span>

          {/* Logic-style header: clicking the name/swatch area opens this track's
              inspector (mix, insert chain, timbre). Auditioning moved to its own ▶ button. */}
          {/**
           * The inspector opener. On a phone this is the row's main target: it was 4×20 px, because
           * its `flex-1 min-w-0` collapsed to the 4 px swatch once the action buttons took the row
           * (the "L:16"/M/S controls consumed all 128 px). It is now at least 44×44 with the track
           * name visible, and the row holds nothing else but the length badge and Mute.
           */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onOpenInspector(trackIdx)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpenInspector(trackIdx);
              }
            }}
            data-testid={`track-header-${trackIdx}`}
            data-inspector-open={isInspectorOpen ? "true" : "false"}
            aria-expanded={isInspectorOpen}
            aria-label={t("track_inspector_open_aria")}
            className={`flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/trk hover:opacity-90 transition-opacity touch-manipulation rounded-sm px-0.5 -mx-0.5 ${
              isMobile ? "min-h-11 min-w-11" : ""
            }`}
            // Inline rather than `bg-[var(--tc)]/12`: the alpha blend on a CSS variable is
            // not something Tailwind's opacity modifier can resolve, and the track colour is
            // per-row. color-mix degrades to "no highlight" on very old browsers.
            style={
              isInspectorOpen
                ? {
                    backgroundColor: "color-mix(in srgb, var(--tc) 14%, transparent)",
                    boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--tc) 60%, transparent)",
                  }
                : undefined
            }
            title={t("track_inspector_open_title")}
          >
            <span
              className={`w-1 h-5 rounded-sm shadow-[0_0_8px_var(--tc)] shrink-0 group-hover/trk:scale-y-110 transition-transform ${
                isSilenced ? "opacity-40" : "opacity-100"
              }`}
              style={{ backgroundColor: trackColour(meta.colourRole) }}
            />
            {/* Mini 4-Segment Activity Meter (Decoupled from React State - P2-03) */}
            <div
              data-meter-track={trackIdx}
              className="flex gap-[1.5px] items-center h-3 px-1 py-0.5 bg-bg rounded border border-line-subtle shrink-0 track-meter"
              title="Audio Activity Peak"
            >
              {[1, 2, 3, 4].map((seg) => (
                <span
                  key={seg}
                  data-meter-seg={seg}
                  className="w-0.5 h-2 rounded-[0.5px] bg-[#1f222b] transition-all duration-75 meter-seg"
                />
              ))}
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className={`font-['JetBrains_Mono'] text-[10.5px] sm:text-[11px] tracking-[0.05em] font-bold truncate transition-colors ${
                isSilenced ? "text-text-dim" : "text-text"
              }`}>
                {meta.name}
              </span>
              <span className="font-['JetBrains_Mono'] text-[8.5px] text-text-dim truncate leading-none hidden sm:block">
                {isZh ? meta.sub.zh : meta.sub.en}
              </span>
            </div>
          </div>

          <div className="flex gap-0.5 sm:gap-1 shrink-0 items-center">
            {/* Audition: previews this track's current timbre. Was the header click before
                the header became the inspector opener. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAudition(trackIdx, track.name);
              }}
              data-testid={`track-audition-${trackIdx}`}
              className="trk-head-desktop-only w-9 h-9 sm:w-4 sm:h-4 border border-line rounded text-text-dim hover:text-accent hover:border-accent/60 transition-colors flex items-center justify-center touch-manipulation select-none"
              title={t("track_audition_title")}
              aria-label={t("track_audition_title")}
            >
              <Play className="w-2.5 h-2.5 sm:w-2 sm:h-2 fill-current" />
            </button>
            {/* Polymeter Loop Length.
                Desktop: a cycling button. Phone: an indicator only — a button here would have to be
                ~30 px wide next to the inspector and Mute, and cycling a track's length is not a
                job a 390 px header does well, so the shell shows the state and leaves the edit to
                the desktop layout (see the plan's keep/drop table). */}
            {isMobile ? (
              track.trackLength && track.trackLength !== stepCount ? (
                <span
                  data-testid={`track-length-badge-${trackIdx}`}
                  className="px-1 h-9 rounded text-[9.5px] font-['JetBrains_Mono'] border border-accent bg-accent/20 text-accent font-bold flex items-center justify-center shrink-0"
                  title={t("track_polymeter_title", { steps: track.trackLength })}
                >
                  L:{track.trackLength}
                </span>
              ) : null
            ) : (
              <button
                onClick={() => onCycleLength(trackIdx)}
                className={`px-1 sm:px-1.5 h-9 sm:h-4 rounded text-[8.5px] sm:text-[8px] font-['JetBrains_Mono'] border transition-colors items-center justify-center touch-manipulation ${
                  track.trackLength && track.trackLength !== stepCount
                    ? "flex bg-accent/20 border-accent text-accent font-bold shadow-[0_0_6px_rgba(245,183,61,0.25)]"
                    : "hidden sm:flex bg-[#17181c] border-line text-text-dim hover:text-text-sub"
                }`}
                title={t("track_polymeter_title", { steps: track.trackLength || stepCount })}
              >
                L:{track.trackLength || stepCount}
              </button>
            )}
            {/* Chord Duration / Technique Selector */}
            {track.track_id === "chords" && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const cur = track.gate?.find((_, i) => (track.steps?.[i] ?? 0) > 0) ?? 16;
                  // Cycle: 16 (4 beats / 1 bar) -> 8 (2 beats / half bar) -> 4 (1 beat) -> 2 (0.5 beat) -> 16
                  const next = cur >= 12 ? 8 : cur >= 6 ? 4 : cur >= 3 ? 2 : 16;
                  onSetChordDuration?.(trackIdx, next);
                }}
                data-testid={`chord-duration-button-${trackIdx}`}
                className="trk-head-desktop-only px-1 sm:px-1.5 h-9 sm:h-4 rounded text-[8.5px] sm:text-[8px] font-['JetBrains_Mono'] border bg-[#17181c] border-line text-accent hover:border-accent/60 transition-colors flex items-center justify-center touch-manipulation select-none font-bold shadow-[0_0_4px_rgba(245,183,61,0.15)]"
                title={isZh ? "和弦长度 (点击切换 4拍/2拍/1拍/半拍)" : "Chord Length (Click to cycle 4 / 2 / 1 / 0.5 beats)"}
                aria-label="Cycle Chord Length"
              >
                {(() => {
                  const g = track.gate?.find((_, i) => (track.steps?.[i] ?? 0) > 0) ?? 16;
                  if (g >= 12) return isZh ? "4拍" : "4B";
                  if (g >= 6) return isZh ? "2拍" : "2B";
                  if (g >= 3) return isZh ? "1拍" : "1B";
                  return isZh ? "半拍" : "½B";
                })()}
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute(trackIdx);
              }}
              className={`${
                isMobile ? "w-11 h-11 text-[12px]" : "w-9 h-9 sm:w-4 sm:h-4 text-[9.5px] sm:text-[9px]"
              } font-['JetBrains_Mono'] border rounded transition-all flex items-center justify-center touch-manipulation select-none active:scale-95 ${
                isMute
                  ? "border-[#ff5964] text-white bg-gradient-to-b from-[#ff5964] to-[#d62839] font-black shadow-[0_0_8px_rgba(255,89,100,0.5)] scale-105"
                  : "border-[#2b3040] bg-[#171922] text-text-dim hover:text-[#ff5964] hover:border-[#ff5964]/50"
              }`}
              title={isMute ? t("track_unmute_title") : t("track_mute_title")}
              aria-label={isMute ? t("track_unmute_aria") : t("track_mute_aria")}
              aria-pressed={isMute}
            >
              M
            </button>
            {/**
             * Solo. Not on a phone: the track inspector keeps mute and solo permanently visible
             * ("Always visible: muting or soloing must not require finding the right tab"), so this
             * is a duplicate — and the row's width is what squeezed the inspector opener down to
             * 4 px. The phone opens the inspector from the row's main target instead.
             */}
            {!isMobile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSolo(trackIdx);
                }}
                className={`w-9 h-9 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9.5px] sm:text-[9px] border rounded transition-all flex items-center justify-center touch-manipulation select-none active:scale-95 ${
                  isSolo
                    ? "border-accent text-black bg-gradient-to-b from-amber-300 to-amber-500 font-black shadow-[0_0_8px_rgba(245,183,61,0.5)] scale-105"
                    : "border-[#2b3040] bg-[#171922] text-text-dim hover:text-accent hover:border-accent/50"
                }`}
                title={isSolo ? t("track_unsolo_title") : t("track_solo_title")}
                aria-label={isSolo ? t("track_unsolo_aria") : t("track_solo_aria")}
                aria-pressed={isSolo}
              >
                S
              </button>
            )}
            {/* Opens the Logic-style track inspector: mix, insert chain and timbre for
                this one track. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInspector(trackIdx);
              }}
              data-testid={`track-inspector-open-${trackIdx}`}
              className="trk-head-desktop-only w-9 h-9 sm:w-4 sm:h-4 border border-line rounded text-text-dim hover:text-accent hover:border-accent/60 transition-colors flex items-center justify-center touch-manipulation select-none"
              title={t("track_inspector_open_title")}
              aria-label={t("track_inspector_open_aria")}
            >
              <SlidersHorizontal className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
            </button>
          </div>
        </div>

        {/* Lower row: Volume slider + Track actions (Velocity Focus, Shift, Smart Fill, Clear) */}
        {!isCompact && (
          <div className="flex items-center justify-between gap-1 text-text-dim">
            {/* Mini Volume & Pan Slider. Desktop only — both are in the inspector's mix
                tab, and the phone column has no room for a second row of controls. */}
            <div className="trk-head-desktop-group flex items-center gap-1 shrink-0" title={`Volume: ${Math.round(trackVol * 100)}%, Pan: ${trackPan < 0 ? `L${Math.round(-trackPan * 100)}` : trackPan > 0 ? `R${Math.round(trackPan * 100)}` : 'C'}`}>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={trackVol}
                onChange={(e) => onChangeVolume(trackIdx, +e.target.value)}
                className="w-9 sm:w-10 h-2 sm:h-1 accent-accent bg-line-subtle rounded cursor-pointer touch-manipulation"
                title={`Vol: ${Math.round(trackVol * 100)}%`}
                aria-label={`${meta.name} Volume`}
              />
              {onChangePan && (
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.1"
                  value={trackPan}
                  onChange={(e) => onChangePan(trackIdx, +e.target.value)}
                  className="w-8 sm:w-9 h-2 sm:h-1 accent-[#45e0c9] bg-line-subtle rounded cursor-pointer hidden lg:block"
                  title={`Pan: ${trackPan < 0 ? `L${Math.round(-trackPan * 100)}` : trackPan > 0 ? `R${Math.round(trackPan * 100)}` : 'C'}`}
                  aria-label={`${meta.name} Pan`}
                />
              )}
            </div>

            {/* Track Quick Actions & Reorder. Desktop only: velocity, piano roll, shift and
                clear are all reachable from the inspector / the mobile studio sheets, and a
                36 px button cannot fit seven-deep inside a 142 px column. */}
            <div className="trk-head-desktop-group flex items-center gap-0.5 shrink-0">
              {onMoveUp && canMoveUp && (
                <button
                  type="button"
                  onClick={() => onMoveUp(trackIdx)}
                  className="w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text hidden md:flex items-center justify-center text-[7px] touch-manipulation"
                  title={t("track_move_up")}
                  aria-label={t("track_move_up_aria")}
                >
                  ▲
                </button>
              )}
              {onMoveDown && canMoveDown && (
                <button
                  type="button"
                  onClick={() => onMoveDown(trackIdx)}
                  className="w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text hidden md:flex items-center justify-center text-[7px] touch-manipulation"
                  title={t("track_move_down")}
                  aria-label={t("track_move_down_aria")}
                >
                  ▼
                </button>
              )}
              <button
                onClick={() => onOpenVelocity(trackIdx)}
                className={`w-9 h-9 sm:w-4 sm:h-4 rounded border transition-colors flex items-center justify-center touch-manipulation ${
                  isVelocityLaneOpen && isVelocityActiveTrack
                    ? "bg-[#45e0c9]/20 border-[#45e0c9] text-[#45e0c9]"
                    : "border-line text-text-dim hover:text-[#45e0c9]"
                }`}
                title={t("track_edit_drawer")}
              >
                <Sliders className="w-2.5 h-2.5" />
              </button>
              {onOpenPianoRoll && (
                <button
                  type="button"
                  onClick={() => onOpenPianoRoll(trackIdx)}
                  className={`w-9 h-9 sm:w-4 sm:h-4 rounded border transition-colors flex items-center justify-center touch-manipulation active:scale-95 ${
                    track.track_id === "chords" || track.track_id === "bass" || track.track_id === "lead"
                      ? "border-accent/50 bg-accent/15 text-accent hover:bg-accent/30 hover:border-accent shadow-[0_0_6px_rgba(var(--accent-rgb),0.25)]"
                      : "border-line text-text-dim hover:text-accent hover:border-accent/60"
                  }`}
                  title={t("roll_toggle_title")}
                  aria-label={t("roll_toggle")}
                  data-testid={`track-piano-roll-open-${trackIdx}`}
                >
                  <Music2 className="w-2.5 h-2.5" />
                </button>
              )}
              <button
                onClick={() => onShiftTrack(trackIdx, -1)}
                className="w-9 h-9 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
                title={t("track_shift_left")}
              >
                ◀
              </button>
              <button
                onClick={() => onShiftTrack(trackIdx, 1)}
                className="w-9 h-9 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
                title={t("track_shift_right")}
              >
                ▶
              </button>
              <button
                onClick={() => onSmartFill(trackIdx)}
                className="hidden md:flex w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-[#45e0c9] items-center justify-center text-[10px] touch-manipulation"
                title={t("track_smart_fill")}
              >
                <Wand2 className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => onClearTrack(trackIdx)}
                className="hidden md:flex w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-[#ff5964] items-center justify-center text-[10px] touch-manipulation"
                title={t("track_clear")}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Step Grid (.grid) */}
      <div className={`flex-1 flex gap-1 relative transition-all duration-150 ${
        isSilenced ? "opacity-25 grayscale saturate-50" : "opacity-100"
      }`}>
        {track.steps.map((rawStepVal, stepIdx) => {
          const activeStepIdx = trackLen > 0 ? stepIdx % trackLen : stepIdx;
          const stepVal = rawStepVal !== undefined ? rawStepVal : (track.steps[activeStepIdx] || 0);
          const vel = track.velocity && track.velocity[stepIdx] !== undefined 
            ? track.velocity[stepIdx] 
            : (track.velocity && track.velocity[activeStepIdx] !== undefined ? track.velocity[activeStepIdx] : 100);
          const isAcc = vel >= 115;
          const isHatRound = isHatTrack && stepVal === 2;
          const isHatTriplet = isHatTrack && stepVal === 3;
          const ratchet = (track.ratchet?.[stepIdx] ?? track.ratchet?.[activeStepIdx]) || (isHatTriplet ? 3 : 1);
          const prob = track.probability?.[stepIdx] ?? track.probability?.[activeStepIdx] ?? 100;
          const isMelodic =
            track.track_id === "bass" || track.track_id === "chords" || track.track_id === "lead";
          const midiNote = track.pitch?.[stepIdx] ?? track.pitch?.[activeStepIdx];
          const isLoopedRepeat = track.trackLength !== undefined && track.trackLength > 0 && track.trackLength < stepCount && stepIdx >= track.trackLength;
          const isOutsideLoop = stepIdx >= (track.steps?.length || stepCount);
          const barIdx = Math.floor(stepIdx / stepsPerBar);
          const isAlternateBar = barIdx % 2 === 1;
          const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
          const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
          const gate = track.gate?.[stepIdx] ?? track.gate?.[activeStepIdx];
          const sustainInfo = sustainMap.get(stepIdx);
          const isSustainTail = Boolean(sustainInfo?.isSustainTail);
          const isSustainEnd = Boolean(sustainInfo?.isSustainEnd);
          const hasSustainFollower = sustainHeadSet.has(stepIdx);
          const sustainSourceIdx = sustainInfo?.sourceStepIdx;
          const sustainTotalSteps = sustainInfo?.totalSteps;

          return (
            <StepCell
              key={stepIdx}
              trackIdx={trackIdx}
              stepIdx={stepIdx}
              stepVal={stepVal}
              velocity={vel}
              isAcc={isAcc}
              isHatRound={isHatRound}
              isHatTriplet={isHatTriplet}
              ratchet={ratchet}
              prob={prob}
              isMelodic={isMelodic}
              midiNote={midiNote}
              gate={gate}
              articulationGateScale={track.track_id === "chords" ? chordArticulation?.gateScale : undefined}
              articulationLabel={track.track_id === "chords" ? chordArticulation?.label : undefined}
              isOutsideLoop={isOutsideLoop}
              isLoopedRepeat={isLoopedRepeat}
              isPlayhead={false}
              isBarStart={isBarStart}
              isGroupStart={isGroupStart}
              trackColor={trackColour(meta.colourRole)}
              isAlternateBar={isAlternateBar}
              isCompact={isCompact}
              isSustainTail={isSustainTail}
              isSustainEnd={isSustainEnd}
              hasSustainFollower={hasSustainFollower}
              sustainSourceIdx={sustainSourceIdx}
              sustainTotalSteps={sustainTotalSteps}
            />
          );
        })}
      </div>
    </div>
  );
});
