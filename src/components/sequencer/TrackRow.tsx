import React, { memo } from "react";
import { Sliders, Wand2 } from "lucide-react";
import { SequencerTrack } from "../../types/genre";
import { StepCell } from "./StepCell";

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
  const trackVol = track.volume !== undefined ? track.volume : 0.8;
  const trackPan = track.pan !== undefined ? track.pan : 0;
  const trackLen = track.trackLength || stepCount;

  return (
    <div
      role="row"
      aria-label={meta.name}
      className={`flex items-center gap-2 sm:gap-3 py-1 sm:py-1.5 landscape-compact-row transition-opacity min-w-max track-row-${trackIdx} ${
        isSilenced ? "opacity-30" : "opacity-100"
      }`}
      style={{ ["--tc" as any]: meta.color }}
    >
      {/* Track Header (.trk-head) - 138px on mobile / 172px on sm+ - Sticky Left */}
      <div className="sticky left-0 z-20 bg-panel flex-none w-[138px] sm:w-[172px] pr-1.5 sm:pr-2 flex flex-col justify-center gap-1 select-none border-r border-line-subtle shadow-[4px_0_12px_rgba(0,0,0,0.6)] overflow-hidden">
        {/* Upper row: Swatch + LED Peak Meter + Title + Polymeter + Mute / Solo */}
        <div className="flex items-center gap-1.5">
          <div
            onClick={() => onAudition(trackIdx, track.name)}
            className="flex items-center gap-1.5 flex-1 min-w-0 cursor-pointer group/trk hover:opacity-90 transition-opacity touch-manipulation"
            title={isZh ? "点击试听音色" : "Tap to audition sound"}
          >
            <span
              className="w-1 h-5 rounded-sm shadow-[0_0_8px_var(--tc)] shrink-0 group-hover/trk:scale-y-110 transition-transform"
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
              <span className="font-['JetBrains_Mono'] text-[10.5px] sm:text-[11px] tracking-[0.05em] text-text font-bold truncate">
                {meta.name}
              </span>
              <span className="font-['JetBrains_Mono'] text-[8.5px] text-text-dim truncate leading-none hidden sm:block">
                {isZh ? meta.sub.zh : meta.sub.en}
              </span>
            </div>
          </div>

          <div className="flex gap-0.5 sm:gap-1 shrink-0 items-center">
            {/* Polymeter Loop Length Selector */}
            <button
              onClick={() => onCycleLength(trackIdx)}
              className={`px-1 sm:px-1.5 h-5 sm:h-4 rounded text-[8.5px] sm:text-[8px] font-['JetBrains_Mono'] border transition-colors items-center justify-center touch-manipulation ${
                track.trackLength && track.trackLength !== stepCount
                  ? "flex bg-accent/20 border-accent text-accent font-bold shadow-[0_0_6px_rgba(245,183,61,0.25)]"
                  : "hidden sm:flex bg-[#17181c] border-line text-text-dim hover:text-text-sub"
              }`}
              title={
                isZh
                  ? `独立轨道循环长度: ${track.trackLength || stepCount} 步 (点击切换)`
                  : `Polymeter length: ${track.trackLength || stepCount} steps (Click to cycle)`
              }
            >
              L:{track.trackLength || stepCount}
            </button>
            <button
              onClick={() => onToggleMute(trackIdx)}
              className={`w-5 h-5 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9px] sm:text-[8.5px] border rounded transition-colors flex items-center justify-center touch-manipulation ${
                isMute
                  ? "border-[var(--tc)] text-[var(--tc)] bg-transparent font-bold"
                  : "border-line text-text-dim hover:text-text"
              }`}
              title={isZh ? "静音轨道" : "Mute track"}
            >
              M
            </button>
            <button
              onClick={() => onToggleSolo(trackIdx)}
              className={`w-5 h-5 sm:w-4 sm:h-4 font-['JetBrains_Mono'] text-[9px] sm:text-[8.5px] border rounded transition-colors flex items-center justify-center touch-manipulation ${
                isSolo
                  ? "border-accent text-accent bg-accent/10 font-bold"
                  : "border-line text-text-dim hover:text-text"
              }`}
              title={isZh ? "独奏轨道" : "Solo track"}
            >
              S
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
                title={isZh ? "上移轨道" : "Move track up"}
                aria-label={isZh ? "上移轨道" : "Move track up"}
              >
                ▲
              </button>
            )}
            {onMoveDown && canMoveDown && (
              <button
                type="button"
                onClick={() => onMoveDown(trackIdx)}
                className="w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text hidden md:flex items-center justify-center text-[7px] touch-manipulation"
                title={isZh ? "下移轨道" : "Move track down"}
                aria-label={isZh ? "下移轨道" : "Move track down"}
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
              title={isZh ? "在多维抽屉中编辑" : "Edit in lane drawer"}
            >
              <Sliders className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => onShiftTrack(trackIdx, -1)}
              className="w-5 h-5 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
              title={isZh ? "向左位移 1 步" : "Shift left 1 step"}
            >
              ◀
            </button>
            <button
              onClick={() => onShiftTrack(trackIdx, 1)}
              className="w-5 h-5 sm:w-4 sm:h-4 rounded hover:bg-line-subtle text-text-dim hover:text-text flex items-center justify-center text-[10px] touch-manipulation"
              title={isZh ? "向右位移 1 步" : "Shift right 1 step"}
            >
              ▶
            </button>
            <button
              onClick={() => onSmartFill(trackIdx)}
              className="hidden md:flex w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-[#45e0c9] items-center justify-center text-[10px] touch-manipulation"
              title={isZh ? "智能生成常规节拍" : "Smart fill rhythm"}
            >
              <Wand2 className="w-2.5 h-2.5" />
            </button>
            <button
              onClick={() => onClearTrack(trackIdx)}
              className="hidden md:flex w-4 h-4 rounded hover:bg-line-subtle text-text-dim hover:text-[#ff5964] items-center justify-center text-[10px] touch-manipulation"
              title={isZh ? "清空轨道" : "Clear track"}
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Step Grid (.grid) */}
      <div className="flex-1 flex gap-1 relative">
        {track.steps.map((stepVal, stepIdx) => {
          const vel = track.velocity && track.velocity[stepIdx] !== undefined ? track.velocity[stepIdx] : 100;
          const isAcc = vel >= 115;
          const isHatRound = isHatTrack && stepVal === 2;
          const isHatTriplet = isHatTrack && stepVal === 3;
          const ratchet = track.ratchet?.[stepIdx] || (isHatTriplet ? 3 : 1);
          const prob = track.probability?.[stepIdx] ?? 100;
          const isMelodic =
            track.track_id === "bass" || track.track_id === "chords" || track.track_id === "lead";
          const midiNote = track.pitch?.[stepIdx];
          const isOutsideLoop = stepIdx >= trackLen;
          const isBarStart = stepIdx % stepsPerBar === 0 && stepIdx !== 0;
          const isGroupStart = stepIdx % groupSize === 0 && stepIdx !== 0;
          const gate = track.gate?.[stepIdx];

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
              isOutsideLoop={isOutsideLoop}
              isPlayhead={false}
              isBarStart={isBarStart}
              isGroupStart={isGroupStart}
              trackColor={meta.color}
            />
          );
        })}
      </div>
    </div>
  );
});
