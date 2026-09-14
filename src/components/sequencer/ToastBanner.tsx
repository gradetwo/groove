import React from "react";
import { Check } from "lucide-react";

export interface ToastBannerProps {
  /** Message currently shown by the Studio toast, or `null` when hidden. */
  message: string | null;
}

/**
 * A-02: the floating Studio toast banner, extracted verbatim from `StudioView`.
 * Renders nothing when `message` is null, matching the previous inline `&&`.
 */
export const ToastBanner: React.FC<ToastBannerProps> = ({ message }) => {
  if (!message) return null;

  return (
    <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 bg-[#1a1c22] border border-line text-text px-4 py-2.5 rounded-lg text-xs font-mono shadow-[0_8px_30px_rgba(0,0,0,0.6)] flex items-center gap-2">
      <Check className="w-3.5 h-3.5 text-accent" />
      <span>{message}</span>
    </div>
  );
};
