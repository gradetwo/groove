import React from "react";
import { Loader2 } from "lucide-react";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "outline" | "danger";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const VARIANT_MAP = {
  primary: "bg-accent text-[#0a0b0d] hover:bg-[#ffc55a] font-bold border-transparent shadow-[0_0_12px_rgba(245,183,61,0.2)]",
  secondary: "bg-[#181a22] text-text hover:bg-[#232632] border-line hover:border-line-strong",
  ghost: "bg-transparent text-text-sub hover:text-text hover:bg-[#161820] border-transparent",
  outline: "bg-transparent text-text hover:text-accent border-line hover:border-accent/50 hover:bg-accent/5",
  danger: "bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border-rose-500/30 hover:border-rose-500/50",
};

const SIZE_MAP = {
  sm: "text-xs px-2.5 py-1.5 rounded-lg min-h-[32px] gap-1.5",
  md: "text-xs sm:text-sm px-3.5 py-2 rounded-xl min-h-[40px] gap-2",
  lg: "text-sm sm:text-base px-5 py-2.5 rounded-xl min-h-[48px] gap-2.5",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      isLoading = false,
      leftIcon,
      rightIcon,
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
        disabled={disabled || isLoading}
        className={`inline-flex items-center justify-center font-medium border transition-all duration-150 select-none disabled:opacity-45 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f5b73d]/50 ${VARIANT_MAP[variant]} ${SIZE_MAP[size]} ${className}`}
        {...rest}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon
        )}
        {children && <span>{children}</span>}
        {!isLoading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";
