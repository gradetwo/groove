import React, { useState, useRef, useEffect, useId } from "react";

export interface TooltipProps {
  content: React.ReactNode;
  shortcut?: string;
  position?: "top" | "bottom" | "left" | "right";
  delayMs?: number;
  children?: React.ReactElement;
  className?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  shortcut,
  position = "top",
  delayMs = 200,
  children,
  className = "",
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tooltipId = useId();

  const showTooltip = () => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delayMs);
  };

  const hideTooltip = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const positionStyles = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
  };

  if (!children) return null;

  // Clone child to attach handlers and aria-describedby
  const trigger = React.cloneElement(children, {
    "aria-describedby": isVisible ? tooltipId : undefined,
    onMouseEnter: (e: React.MouseEvent) => {
      children.props.onMouseEnter?.(e);
      showTooltip();
    },
    onMouseLeave: (e: React.MouseEvent) => {
      children.props.onMouseLeave?.(e);
      hideTooltip();
    },
    onFocus: (e: React.FocusEvent) => {
      children.props.onFocus?.(e);
      showTooltip();
    },
    onBlur: (e: React.FocusEvent) => {
      children.props.onBlur?.(e);
      hideTooltip();
    },
  });

  return (
    <div className={`relative inline-flex ${className}`}>
      {trigger}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute z-50 px-2.5 py-1.5 text-xs rounded bg-panel border border-line text-text shadow-xl whitespace-nowrap pointer-events-none flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-100 ${positionStyles[position]}`}
        >
          <span>{content}</span>
          {shortcut && (
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-line text-text-sub rounded border border-line/60">
              {shortcut}
            </kbd>
          )}
        </div>
      )}
    </div>
  );
};
