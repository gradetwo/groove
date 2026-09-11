import React from "react";

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerAction?: React.ReactNode;
  variant?: "default" | "glass" | "subtle" | "interactive";
  padding?: "none" | "sm" | "md" | "lg";
}

const VARIANT_MAP = {
  default: "bg-panel border border-line shadow-lg",
  glass: "bg-panel2/80 backdrop-blur-md border border-line shadow-xl",
  subtle: "bg-white/[0.02] border border-line-subtle",
  interactive: "bg-panel border border-line hover:border-line-strong hover:bg-[#161820] transition-all cursor-pointer shadow-md hover:shadow-xl",
};

const PADDING_MAP = {
  none: "p-0",
  sm: "p-3 sm:p-4",
  md: "p-4 sm:p-6",
  lg: "p-6 sm:p-8",
};

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      title,
      subtitle,
      headerAction,
      variant = "default",
      padding = "md",
      className = "",
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl overflow-hidden ${VARIANT_MAP[variant]} ${PADDING_MAP[padding]} ${className}`}
        {...rest}
      >
        {(title || headerAction) && (
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-line/60">
            <div>
              {title && <h3 className="text-sm sm:text-base font-bold text-text truncate">{title}</h3>}
              {subtitle && <p className="text-xs text-text-sub truncate mt-0.5">{subtitle}</p>}
            </div>
            {headerAction && <div className="shrink-0">{headerAction}</div>}
          </div>
        )}
        {children}
      </div>
    );
  }
);

Card.displayName = "Card";
