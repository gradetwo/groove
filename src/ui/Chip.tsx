import React from "react";
import { X } from "lucide-react";

export interface ChipProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  children?: React.ReactNode;
  variant?: "default" | "active" | "subtle" | "outline" | "accent";
  size?: "sm" | "md";
  icon?: React.ReactNode;
  onRemove?: () => void;
  clickable?: boolean;
}

const VARIANT_MAP = {
  default: "bg-[#161820] text-text-sub border-line hover:text-text hover:border-line-strong",
  active: "bg-accent/10 text-accent border-accent/40 shadow-[0_0_8px_rgba(245,183,61,0.15)] font-medium",
  accent: "bg-accent/10 text-accent border-accent/40 shadow-[0_0_8px_rgba(245,183,61,0.15)] font-medium",
  subtle: "bg-white/[0.04] text-text-sub border-transparent",
  outline: "bg-transparent text-text-sub border-line hover:text-text",
};

const SIZE_MAP = {
  sm: "text-[11px] px-2 py-0.5 rounded-md gap-1",
  md: "text-xs px-2.5 py-1 rounded-lg gap-1.5",
};

export const Chip: React.FC<ChipProps> = ({
  label,
  children,
  variant = "default",
  size = "md",
  icon,
  onRemove,
  clickable = false,
  className = "",
  onClick,
  ...rest
}) => {
  const content = label ?? children;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        clickable && onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick(e as unknown as React.MouseEvent<HTMLDivElement>);
              }
            }
          : undefined
      }
      className={`inline-flex items-center border transition-all duration-150 select-none ${
        clickable ? "cursor-pointer active:scale-95 outline-none focus-visible:ring-2 focus-visible:ring-accent" : ""
      } ${VARIANT_MAP[variant]} ${SIZE_MAP[size]} ${className}`}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{content}</span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove chip"
          className="hover:text-rose-400 p-0.5 rounded transition-colors -mr-0.5"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
