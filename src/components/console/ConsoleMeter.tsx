import React from "react";
import { clipZonePosition, dbToMeterPosition } from "./meterMath";

export interface ConsoleMeterProps {
  /** Reveal elements the 60fps loop writes `height` to (bottom-up). */
  leftRef: React.MutableRefObject<HTMLDivElement | null>;
  rightRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Rendered travel of a single meter bar in px. */
  heightPx?: number;
  /** Draw the dBFS ruler next to the bars (master strip only). */
  showScale?: boolean;
  showClipLabel?: boolean;
  testId?: string;
  className?: string;
}

const SCALE_TICKS_DB = [0, -6, -12, -24, -48];

/**
 * Independent stereo peak meter, dBFS-scaled with a red clip zone at the top.
 * The bars themselves are written imperatively by the view's requestAnimationFrame
 * loop so a 60fps meter never triggers a React render.
 */
export const ConsoleMeter: React.FC<ConsoleMeterProps> = ({
  leftRef,
  rightRef,
  heightPx = 148,
  showScale = false,
  showClipLabel = false,
  testId,
  className = "",
}) => {
  const clipBottom = `${clipZonePosition() * 100}%`;

  return (
    <div className={`flex items-stretch gap-1 ${className}`} data-testid={testId}>
      <div className="relative flex items-stretch gap-[3px]" style={{ height: heightPx }}>
        {[
          { side: "L", ref: leftRef },
          { side: "R", ref: rightRef },
        ].map(({ side, ref }) => (
          <div
            key={side}
            className="relative w-2.5 rounded-sm bg-[#111218] border border-line-subtle overflow-hidden"
            data-console-meter-track={side}
          >
            {/* Red clip zone: always visible so the danger area is legible. */}
            <div
              className="absolute left-0 right-0 top-0 bg-[#ff5964]/25 border-b border-[#ff5964]/70"
              style={{ bottom: clipBottom }}
              data-clip-zone="true"
              aria-hidden="true"
            />
            {/* Full-height gradient revealed bottom-up by the rAF loop. */}
            <div
              ref={ref}
              data-meter-bar={side}
              className="absolute bottom-0 left-0 right-0 h-0 overflow-hidden will-change-[height]"
            >
              <div
                className="absolute bottom-0 left-0 right-0 w-full"
                style={{
                  height: heightPx,
                  background:
                    "linear-gradient(to top, #45e0c9 0%, #45e0c9 58%, #f5b73d 82%, #ff5964 95%, #ff5964 100%)",
                }}
              />
            </div>
          </div>
        ))}

        {showScale && (
          <div className="relative w-9 select-none" aria-hidden="true">
            {SCALE_TICKS_DB.map((db) => {
              const bottom = dbToMeterPosition(db) * 100;
              return (
                <div
                  key={db}
                  className="absolute left-0 right-0 flex items-center gap-0.5"
                  style={{ bottom: `${bottom}%`, transform: "translateY(50%)" }}
                >
                  <span className="w-1.5 border-t border-line-strong" />
                  <span className="font-['JetBrains_Mono'] text-[8px] leading-none text-text-dim">
                    {db}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showClipLabel && (
        <span className="self-start font-['JetBrains_Mono'] text-[8px] tracking-wider text-[#ff5964]/80">
          CLIP
        </span>
      )}
    </div>
  );
};
