import React, { memo } from "react";
import { Music2, Play, Sliders, SlidersHorizontal, Wand2 } from "lucide-react";
import { SequencerTrack } from "../../types/genre";
import { StepCell } from "./StepCell";
import { useLanguage } from "../../i18n/LanguageContext";

export interface TrackMetaConfig {
  id: string;
  name: string;
  sub: { zh: string; en: string };
  color: string;
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
}) {
  const { t } = useLanguage();
  const trackVol = track.volume !== undefined ? track.volume : 0.8;
  const trackPan = track.pan !== undefined ? track.pan : 0;
  const trackLen = track.trackLength || stepCount;

  return (
    <div
      role="row"
      aria-label={meta.name}
      className={`flex items-center gap-2 sm:gap-3 py-1 sm:py-1.5 landscape-compact-row transition-opacity min-w-max track-row-${trackIdx}`}
      style={{ ["--tc" as any]: meta.color }}
    >
      {/* Track Header (.trk-head) - 138px on mobile / 172px on sm+ - Sticky Left */}
      <div className={`sticky left-0 z-20 bg-gradient-to-r from-[#161822] to-[#121319] flex-none w-[138px] sm:w-[172px] pr-1.5 sm:pr-2 pl-1 flex flex-col justify-center gap-1 select-none border-r border-line-subtle border-l-[3px] border-l-[var(--tc)] shadow-[4px_0_12px_rgba(0,0,0,0.6)] overflow-hidden transition-opacity ${
        isSilenced && !isMute && !isSolo ? "opacity-60" : "opacity-100"
      }`}>
        {/* Upper row: Swatch + LED Peak Meter + Title + Polymeter + Mute / Solo */}
        <div className="flex items-center gap-1.5">
          {/* Logic-style header: clicking the name/swatch area opens this track's
              inspector (mix, insert chain, timbre). Auditioning moved to its own ▶ button. */}
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
            className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/trk hover:opacity-90 transition-opacity touch-manipulation rounded-sm px-0.5 -mx-0.5"
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
              style={{ backgroundColor: meta.color }}
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
              className="w-5 h-5 sm:w-4 sm:h-4 border border-line rounded text-text-dim hover:text-accent hover:border-accent/60 transition-colors flex items-center justify-center touch-manipulation select-none"
              title={t("track_audition_title")}
              aria-label={t("track_audition_title")}
            >
              <Play className="w-2.5 h-2.5 sm:w-2 sm:h-2 fill-current" />
            </button>
            {/* Polymeter Loop Length Selector */}
            <button
              onClick={() => onCycleLength(trackIdx)}
              className={`px-1 sm:px-1.5 h-5 sm:h-4 rounded text-[8.5px] sm:text-[8px] font-['JetBrains_Mono'] border transition-colors items-center justify-center touch-manipulation ${
                track.trackLength && track.trackLength !== stepCount
                  ? "flex bg-accent/20 border-accent text-accent font-bold shadow-[0_0_6px_rgba(245,183,61,0.25)]"
                  : "hidden sm:flex bg-[#17181c] border-line text-text-dim hover:text-text-sub"
              }`}
              title={
                t("track_polymeter_title", { steps: track.trackLength || stepCount })
              }
            >
              L:{track.trackLength || stepCount}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute(trackIdx);
              }}
              className={`w-5 h-5 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9.5px] sm:text-[9px] border rounded transition-all flex items-center justify-center touch-manipulation select-none active:scale-95 ${
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
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleSolo(trackIdx);
              }}
              className={`w-5 h-5 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9.5px] sm:text-[9px] border rounded transition-all flex items-center justify-center touch-manipulation select-none active:scale-95 ${
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
            {/* Opens the Logic-style track inspector: mix, insert chain and timbre for
                this one track. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenInspector(trackIdx);
              }}
              data-testid={`track-inspector-open-${trackIdx}`}
              className="w-5 h-5 sm:w-4 sm:h-4 border border-line rounded text-text-dim hover:text-accent hover:border-accent/60 transition-colors flex items-center justify-center touch-manipulation select-none"
              title={t("track_inspector_open_title")}
              aria-label={t("track_inspector_open_aria")}
            >
              <SlidersHorizontal className="w-3 h-3 sm:w-2.5 sm:h-2.5" />
            </button>
          </div>
        </div>

        {/* Lower row: Volume slider + Track actions (Velocity Focus, Shift, Smart Fill, Clear) */}
        <div className="flex items-center justify-between gap-1 text-text-dim">
          {/* Mini Volume & Pan Slider */}
          <div className="flex items-center gap-1 shrink-0" title={`Volume: ${Math.round(trackVol * 100)}%, Pan: ${trackPan < 0 ? `L${Math.round(-trackPan * 100)}` : trackPan > 0 ? `R${Math.round(trackPan * 100)}` : 'C'}`}>
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

          {/* Track Quick Actions & Reorder */}
          <div className="flex items-center gap-0.5 shrink-0">
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
              className={`w-5 h-5 sm:w-4 sm:h-4 rounded border transition-colors flex items-center justify-center touch-manipulation ${
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
                className={`w-5 h-5 sm:w-4 sm:h-4 rounded border transition-colors flex items-center justify-center touch-manipulation active:scale-95 ${
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
              className="w-5 h-5 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
              title={t("track_shift_left")}
            >
              ◀
            </button>
            <button
              onClick={() => onShiftTrack(trackIdx, 1)}
              className="w-5 h-5 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
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
              trackColor={meta.color}
              isAlternateBar={isAlternateBar}
            />
          );
        })}
      </div>
    </div>
  );
});
