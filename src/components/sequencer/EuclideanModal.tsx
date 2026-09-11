import React, { useState, useMemo } from "react";
import { SequencerTrack } from "../../types/genre";
import { generateEuclidean, EUCLIDEAN_PRESETS } from "../../audio/Euclidean";
import { Sparkles, RotateCw, Play, Check, X, Disc3 } from "lucide-react";
import { Modal } from "../../ui";
import { useLanguage } from "../../i18n/LanguageContext";

interface EuclideanModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: SequencerTrack[];
  tracksConfig: Array<{ id: string; name: string; color: string }>;
  initialTrackIdx?: number;
  onApplyEuclidean: (trackIdx: number, steps: number[]) => void;
  language?: "zh" | "en";
  stepCount: number;
}

export const EuclideanModal: React.FC<EuclideanModalProps> = ({
  isOpen,
  onClose,
  tracks,
  tracksConfig,
  initialTrackIdx = 0,
  onApplyEuclidean,
  language: _propLanguage,
  stepCount,
}) => {
  const { t, isZh } = useLanguage();
  const [selectedTrackIdx, setSelectedTrackIdx] = useState(initialTrackIdx);
  const [totalSteps, setTotalSteps] = useState(stepCount || 16);
  const [pulses, setPulses] = useState(5);
  const [rotation, setRotation] = useState(0);

  const activeMeta = tracksConfig[selectedTrackIdx % tracksConfig.length];

  // Compute pattern
  const euclideanPattern = useMemo(() => {
    return generateEuclidean(totalSteps, pulses, rotation);
  }, [totalSteps, pulses, rotation]);

  if (!isOpen) return null;

  const handleApply = () => {
    // If pattern stepCount differs, expand or repeat
    let result = [...euclideanPattern];
    if (result.length < stepCount) {
      while (result.length < stepCount) {
        result = result.concat(euclideanPattern);
      }
      result = result.slice(0, stepCount);
    }
    onApplyEuclidean(selectedTrackIdx, result);
    onClose();
  };

  const handleSelectPreset = (preset: typeof EUCLIDEAN_PRESETS[0]) => {
    setTotalSteps(preset.n);
    setPulses(preset.k);
    setRotation(preset.rot);
  };

  // Coordinates for circular SVG preview
  const radius = 90;
  const center = 110;
  const circlePoints = euclideanPattern.map((val, idx) => {
    const angle = (idx / totalSteps) * 2 * Math.PI - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y, isOn: val === 1, idx };
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="xl"
      showCloseButton={false}
      ariaLabel={t("euclidean_modal_aria")}
    >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1f222b]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-accent" />
            </div>
            <div>
              <h3 className="font-['Space_Grotesk'] text-base font-bold text-text">
                {t("euclidean_modal_title")}
              </h3>
              <p className="text-[11px] text-text-sub">
                {t("euclidean_desc")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            aria-label="Close"
            className="p-1.5 rounded-lg hover:bg-[#1a1c22] text-text-sub hover:text-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5">
          {/* Target Track Selector */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-text-sub mb-2">
              {t("euclidean_target_track")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {tracks.map((t, idx) => {
                const meta = tracksConfig[idx % tracksConfig.length];
                const isSelected = idx === selectedTrackIdx;
                return (
                  <button
                    key={t.track_id}
                    onClick={() => setSelectedTrackIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-['JetBrains_Mono'] font-bold border transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? "bg-[#181a22] text-[#f0ede6] shadow-[0_0_10px_rgba(0,0,0,0.5)] scale-105"
                        : "bg-bg text-[#717684] border-[#1e212b] hover:text-text"
                    }`}
                    style={{ borderColor: isSelected ? meta.color : undefined }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    <span>{meta.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Interactive Sliders & Circular Euclidean Visualizer */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            {/* Left: Sliders */}
            <div className="space-y-4">
              {/* Pulses (K) */}
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-text-sub">{t("euclidean_pulses")}</span>
                  <span className="font-bold text-accent">{pulses}</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max={totalSteps}
                  value={pulses}
                  onChange={(e) => setPulses(+e.target.value)}
                  className="w-full accent-accent bg-line-subtle rounded cursor-pointer"
                />
              </div>

              {/* Total Steps (N) */}
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-text-sub">{t("euclidean_steps")}</span>
                  <span className="font-bold text-[#45e0c9]">{totalSteps}</span>
                </div>
                <input
                  type="range"
                  min="4"
                  max="32"
                  value={totalSteps}
                  onChange={(e) => {
                    const val = +e.target.value;
                    setTotalSteps(val);
                    if (pulses > val) setPulses(val);
                  }}
                  className="w-full accent-[#45e0c9] bg-line-subtle rounded cursor-pointer"
                />
              </div>

              {/* Rotation (R) */}
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-text-sub">{t("euclidean_rotation")}</span>
                  <span className="font-bold text-[#ffb65c]">{rotation >= 0 ? `+${rotation}` : rotation}</span>
                </div>
                <input
                  type="range"
                  min={-totalSteps}
                  max={totalSteps}
                  value={rotation}
                  onChange={(e) => setRotation(+e.target.value)}
                  className="w-full accent-[#ffb65c] bg-line-subtle rounded cursor-pointer"
                />
              </div>
            </div>

            {/* Right: Circular Rhythm Radar Graphic */}
            <div className="flex flex-col items-center justify-center p-3 bg-[#0a0b0e] border border-[#1b1e26] rounded-2xl">
              <svg width="220" height="220" className="select-none">
                {/* Outer guide ring */}
                <circle cx={center} cy={center} r={radius} fill="none" stroke="#1f222b" strokeWidth="1.5" />
                <circle cx={center} cy={center} r={radius * 0.5} fill="none" stroke="#151720" strokeWidth="1" strokeDasharray="2 4" />

                {/* Connecting polygon of active hits */}
                {circlePoints.filter((p) => p.isOn).length >= 3 && (
                  <polygon
                    points={circlePoints
                      .filter((p) => p.isOn)
                      .map((p) => `${p.x},${p.y}`)
                      .join(" ")}
                    fill={activeMeta.color}
                    fillOpacity="0.12"
                    stroke={activeMeta.color}
                    strokeWidth="1.5"
                  />
                )}

                {/* Step Dots */}
                {circlePoints.map((pt) => (
                  <g key={pt.idx}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={pt.isOn ? 6.5 : 3}
                      fill={pt.isOn ? activeMeta.color : "#282c38"}
                      stroke={pt.isOn ? "#ffffff" : "none"}
                      strokeWidth={pt.isOn ? 1.5 : 0}
                    />
                    {pt.isOn && (
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r={10}
                        fill="none"
                        stroke={activeMeta.color}
                        strokeWidth="0.75"
                        strokeDasharray="2 2"
                        className="animate-pulse"
                      />
                    )}
                  </g>
                ))}
              </svg>
              <div className="font-mono text-[11px] text-text-sub mt-1">
                E({pulses}, {totalSteps}) {rotation !== 0 ? `rot ${rotation}` : ""}
              </div>
            </div>
          </div>

          {/* Quick World Rhythms Presets */}
          <div>
            <label className="block text-[11px] font-mono text-[#6b7280] uppercase tracking-wider mb-2">
              {t("euclidean_presets")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EUCLIDEAN_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelectPreset(p)}
                  className="px-2.5 py-1 rounded bg-bg hover:bg-[#181a22] border border-line text-[11px] text-text-sub hover:text-text font-mono transition-colors"
                >
                  {isZh ? p.name.zh : p.name.en}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1f222b] bg-[#0c0d12]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-mono font-semibold text-text-sub hover:text-text hover:bg-[#1a1c22] transition-colors"
          >
            {t("cancel")}
          </button>
          <button
            onClick={handleApply}
            className="px-5 py-2 rounded-xl text-xs font-['Space_Grotesk'] font-bold bg-accent text-black hover:brightness-110 transition-transform shadow-[0_0_15px_rgba(245,183,61,0.3)] flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>{t("euclidean_apply")}</span>
          </button>
        </div>
    </Modal>
  );
};
