import React from "react";

export interface SkeletonProps {
  variant?: "line" | "rect" | "circle" | "card";
  width?: string | number;
  height?: string | number;
  className?: string;
  "aria-label"?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "line",
  width,
  height,
  className = "",
  "aria-label": ariaLabel = "Loading...",
}) => {
  const getVariantStyles = () => {
    switch (variant) {
      case "circle":
        return "rounded-full w-10 h-10";
      case "rect":
        return "rounded-md w-full h-24";
      case "card":
        return "rounded-lg w-full h-40 p-4 flex flex-col gap-3";
      case "line":
      default:
        return "rounded h-4 w-full";
    }
  };

  const inlineStyles: React.CSSProperties = {
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };

  if (variant === "card") {
    return (
      <div
        role="status"
        aria-busy="true"
        aria-label={ariaLabel}
        className={`bg-panel border border-line animate-pulse ${getVariantStyles()} ${className}`}
        style={inlineStyles}
      >
        <div className="h-4 bg-line/80 rounded w-1/3" />
        <div className="h-3 bg-line/60 rounded w-2/3 mt-1" />
        <div className="h-16 bg-line/40 rounded mt-auto" />
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={ariaLabel}
      className={`bg-line/70 animate-pulse ${getVariantStyles()} ${className}`}
      style={inlineStyles}
    />
  );
};
