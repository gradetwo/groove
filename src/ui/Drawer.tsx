import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children?: React.ReactNode;
  position?: "bottom" | "right";
  className?: string;
  ariaLabel?: string;
  showCloseButton?: boolean;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  position = "bottom",
  className = "",
  ariaLabel,
  showCloseButton = true,
}) => {
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isBottom = position === "bottom";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === "string" ? title : undefined)}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={drawerRef}
        className={`w-full bg-[#12141a] border border-line shadow-2xl flex flex-col focus:outline-none ${
          isBottom
            ? "max-h-[88vh] rounded-t-2xl border-b-0 animate-slide-up pb-safe"
            : "max-w-md h-full rounded-l-2xl border-r-0 animate-slide-left self-stretch ml-auto"
        } ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Drag handle for mobile */}
        {isBottom && (
          <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-[#2a2d36]" />
          </div>
        )}

        {/* Drawer Header */}
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#1f222b]">
            {title && (
              <h3 className="font-['Space_Grotesk'] text-sm sm:text-base font-bold text-text">
                {title}
              </h3>
            )}
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close drawer"
                className="p-1.5 rounded-lg hover:bg-[#1a1c22] text-text-sub hover:text-text transition-colors ml-auto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 custom-scroll">
          {children}
        </div>
      </div>
    </div>
  );
};
