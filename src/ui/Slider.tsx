import React, { useRef, useCallback } from "react";

export interface SliderProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  label?: string;
  "aria-label": string;
  formatValue?: (value: number) => string;
  className?: string;
  showValue?: boolean;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  label,
  "aria-label": ariaLabel,
  formatValue,
  className = "",
  showValue = false,
  disabled = false,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);

  const clamped = Math.min(Math.max(value, min), max);
  const percentage = max > min ? ((clamped - min) / (max - min)) * 100 : 0;

  const updateFromPosition = useCallback(
    (clientX: number) => {
      if (disabled || !trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const rawPct = (clientX - rect.left) / rect.width;
      const clampedPct = Math.min(Math.max(rawPct, 0), 1);
      const rawVal = min + clampedPct * (max - min);
      const steppedVal = Math.round(rawVal / step) * step;
      const finalVal = Math.min(Math.max(steppedVal, min), max);
      onChange(finalVal);
    },
    [min, max, step, onChange, disabled]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    updateFromPosition(e.clientX);

    const onPointerMove = (moveEvent: PointerEvent) => {
      updateFromPosition(moveEvent.clientX);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    let nextVal = clamped;
    const bigStep = step * 10 || 10;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        nextVal = Math.min(clamped + step, max);
        break;
      case "ArrowLeft":
      case "ArrowDown":
        nextVal = Math.max(clamped - step, min);
        break;
      case "PageUp":
        nextVal = Math.min(clamped + bigStep, max);
        break;
      case "PageDown":
        nextVal = Math.max(clamped - bigStep, min);
        break;
      case "Home":
        nextVal = min;
        break;
      case "End":
        nextVal = max;
        break;
      default:
        return;
    }

    e.preventDefault();
    onChange(nextVal);
  };

  const formattedDisplay = formatValue ? formatValue(clamped) : String(clamped);

  return (
    <div className={`flex flex-col gap-1.5 select-none ${disabled ? "opacity-50 pointer-events-none" : ""} ${className}`}>
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs font-mono">
          {label && <span className="text-text-sub font-medium truncate">{label}</span>}
          {showValue && <span className="text-text font-bold">{formattedDisplay}</span>}
        </div>
      )}

      {/* 44px minimum touch target height container */}
      <div
        ref={trackRef}
        className="relative flex items-center h-11 cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        tabIndex={disabled ? -1 : 0}
        role="slider"
        aria-label={ariaLabel}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={formattedDisplay}
        onKeyDown={handleKeyDown}
      >
        {/* Track background */}
        <div className="w-full h-1.5 rounded-full bg-line overflow-hidden relative">
          {/* Active fill */}
          <div
            className="absolute top-0 left-0 bottom-0 bg-accent rounded-full"
            style={{ width: `${percentage}%` }}
          />
        </div>

        {/* Thumb */}
        <div
          className="absolute w-4 h-4 rounded-full bg-accent border-2 border-bg shadow-md -translate-x-1/2 transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:ring-2 focus-visible:ring-accent outline-none"
          style={{ left: `${percentage}%` }}
        />
      </div>
    </div>
  );
};
