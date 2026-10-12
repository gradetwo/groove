import React from "react";
import { Play, Square } from "lucide-react";
import { Button } from "../../ui/Button";
import { ConsoleMeter } from "./ConsoleMeter";
import { formatDb } from "./meterMath";

export interface MasterStripProps {
  volume: number;
  isPlaying: boolean;
  t: (key: any, vars?: Record<string, string | number>) => string;
  meterLeftRef: React.MutableRefObject<HTMLDivElement | null>;
  meterRightRef: React.MutableRefObject<HTMLDivElement | null>;
  onVolumeChange: (volume: number) => void;
  onToggleTransport: () => void;
}

/**
 * Master section: master fader, real stereo peak meter fed by the engine's
 * analysers, and the transport toggle that starts the pattern the desk is
 * mixing. The master fader has no store field, so it writes straight to
 * `AudioEngine.setMasterVolume`.
 *
 * The strip is `sticky right-0` inside the desk's horizontal scroll container: at
 * 1440px the eight channels already overflow, and the master fader plus transport
 * are the two controls you must never have to scroll to reach. The negative-margin
 * shadow paints a soft edge so strips scrolling beneath it stay legible.
 */
export const MasterStrip: React.FC<MasterStripProps> = ({
  volume,
  isPlaying,
  t,
  meterLeftRef,
  meterRightRef,
  onVolumeChange,
  onToggleTransport,
}) => {
  return (
    <div
      data-testid="console-master"
      className="sticky right-0 z-10 flex w-[168px] shrink-0 flex-col items-center gap-3 rounded-xl border border-accent/40 bg-panel2 px-3 py-3 shadow-[-12px_0_20px_-8px_rgba(0,0,0,0.75),0_0_24px_rgba(245,183,61,0.08)]"
    >
      <div className="flex w-full items-center justify-between">
        <span className="font-['JetBrains_Mono'] text-[11px] font-bold tracking-[0.12em] text-accent">
          {t("console_master_label")}
        </span>
        <span className="font-['JetBrains_Mono'] text-[9px] text-text-dim">dBFS</span>
      </div>

      <Button
        variant={isPlaying ? "primary" : "secondary"}
        size="sm"
        onClick={onToggleTransport}
        aria-label={t("console_transport_aria")}
        data-testid="console-transport-toggle"
        leftIcon={isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        className="w-full"
      >
        {isPlaying ? t("console_stop") : t("console_play")}
      </Button>

      <div className="flex items-stretch gap-2">
        <ConsoleMeter
          leftRef={meterLeftRef}
          rightRef={meterRightRef}
          heightPx={378}
          showScale
          testId="console-master-meter"
        />
        <div className="flex flex-col items-center gap-1">
          <span className="font-['JetBrains_Mono'] text-[9px] tabular-nums text-accent">
            {formatDb(volume)}
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            aria-label={t("console_master_volume_aria")}
            data-testid="console-master-fader"
            className="h-[100mm] w-7 cursor-pointer accent-[#f5b73d]"
            style={{ writingMode: "vertical-lr", direction: "rtl" }}
          />
        </div>
      </div>

      <span className="font-['JetBrains_Mono'] text-[9px] tabular-nums text-text-sub">
        {Math.round(volume * 100)}%
      </span>
    </div>
  );
};
