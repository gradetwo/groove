import React from "react";
import { Loader2 } from "lucide-react";

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Strictly required accessible label for screen readers */
  "aria-label": string;
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

const VARIANT_MAP = {
  primary: "bg-accent text-[#0a0b0d] hover:bg-[#ffc55a] border-transparent shadow-[0_0_10px_rgba(245,183,61,0.2)]",
  secondary: "bg-[#181a22] text-text hover:bg-[#232632] border-line hover:border-line-strong",
  ghost: "bg-transparent text-text-sub hover:text-text hover:bg-[#161820] border-transparent",
  outline: "bg-transparent text-text hover:text-accent border-line hover:border-accent/50 hover:bg-accent/5",
  danger: "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30 hover:border-rose-500/50",
};

const SIZE_MAP = {
  sm: "w-7 h-7 p-1 rounded-lg text-xs",
  md: "w-9 h-9 p-1.5 rounded-xl text-sm",
  lg: "w-11 h-11 p-2 rounded-xl text-base",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      "aria-label": ariaLabel,
      variant = "ghost",
      size = "md",
      isLoading = false,
      icon,
      className = "",
      disabled,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        aria-label={ariaLabel}
        title={ariaLabel}
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center border transition-all duration-150 select-none disabled:opacity-40 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b73d]/50 shrink-0 ${VARIANT_MAP[variant]} ${SIZE_MAP[size]} ${className}`}
        {...rest}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-accent" />
        ) : (
          icon || children
        )}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";
