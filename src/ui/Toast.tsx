import React, { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "info" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

type ToastListener = (toasts: ToastItem[]) => void;

class ToastManager {
  private toasts: ToastItem[] = [];
  private listeners: Set<ToastListener> = new Set();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  subscribe(listener: ToastListener) {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l([...this.toasts]));
  }

  show(message: string, type: ToastType = "info", duration = 3000) {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newToast: ToastItem = { id, message, type, duration };

    // Keep max 3 toasts to prevent flooding
    if (this.toasts.length >= 3) {
      const oldest = this.toasts.shift();
      if (oldest) {
        const t = this.timers.get(oldest.id);
        if (t) clearTimeout(t);
        this.timers.delete(oldest.id);
      }
    }

    this.toasts.push(newToast);
    this.notify();

    if (duration > 0) {
      const timer = setTimeout(() => {
        this.dismiss(id);
      }, duration);
      this.timers.set(id, timer);
    }

    return id;
  }

  success(message: string, duration = 3000) {
    return this.show(message, "success", duration);
  }

  error(message: string, duration = 4000) {
    return this.show(message, "error", duration);
  }

  info(message: string, duration = 3000) {
    return this.show(message, "info", duration);
  }

  warning(message: string, duration = 3500) {
    return this.show(message, "warning", duration);
  }

  dismiss(id: string) {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);

    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  clearAll() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.toasts = [];
    this.notify();
  }
}

export const toast = new ToastManager();

const ICON_MAP = {
  success: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  info: <Info className="w-4 h-4 text-accent shrink-0" />,
  warning: <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />,
  error: <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />,
};

const COLOR_MAP = {
  success: "border-emerald-500/30 bg-[#0d1512]/95 text-emerald-200",
  info: "border-accent/30 bg-[#14120e]/95 text-accent",
  warning: "border-amber-500/30 bg-[#16130d]/95 text-amber-200",
  error: "border-rose-500/30 bg-[#180e10]/95 text-rose-200",
};

export const ToastContainer: React.FC<{ position?: "bottom" | "top" }> = ({
  position = "bottom",
}) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    return toast.subscribe(setToasts);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className={`fixed z-[100] left-1/2 -translate-x-1/2 flex flex-col gap-2 w-full max-w-sm px-4 pointer-events-none ${
        position === "bottom"
          ? "bottom-6 pb-safe"
          : "top-6 pt-safe"
      }`}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border shadow-2xl backdrop-blur-md pointer-events-auto animate-slide-up text-xs ${COLOR_MAP[t.type]}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {ICON_MAP[t.type]}
            <span className="truncate">{t.message}</span>
          </div>
          <button
            onClick={() => toast.dismiss(t.id)}
            aria-label="Dismiss notification"
            className="p-1 rounded hover:bg-white/10 opacity-70 hover:opacity-100 transition-opacity ml-auto shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
};
