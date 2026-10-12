import React, { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { X } from "lucide-react";

/**
 * The open dialogs, innermost last — plus a change token so every instance re-renders when the
 * stack moves.
 *
 * Deliberately module-level: "which dialog is on top" is a property of the window, not of any one
 * component, and every instance has to give the same answer. Two things went wrong without it:
 * every open dialog attached its own `window` keydown handler, so **one Escape closed the whole
 * stack** (and two `Tab` traps fought over focus); and every dialog announced itself as
 * `aria-modal="true"`, which tells assistive tech to ignore everything outside it — including the
 * dialog sitting on top of it.
 *
 * Entries are removed by identity, so a dialog that unmounts out of order cannot corrupt the list.
 */
const openDialogs: string[] = [];
const stackListeners = new Set<() => void>();
let stackToken = 0;

function subscribeToStack(listener: () => void): () => void {
  stackListeners.add(listener);
  return () => {
    stackListeners.delete(listener);
  };
}

const stackSnapshot = () => stackToken;

function bumpStack(): void {
  stackToken += 1;
  for (const listener of stackListeners) listener();
}

function pushDialog(id: string): void {
  openDialogs.push(id);
  bumpStack();
}

function removeDialog(id: string): void {
  const at = openDialogs.lastIndexOf(id);
  if (at < 0) return;
  openDialogs.splice(at, 1);
  bumpStack();
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  overlayClassName?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl";
  closeOnEsc?: boolean;
  closeOnBackdropClick?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement>;
  ariaLabel?: string;
  showCloseButton?: boolean;
}

const MAX_WIDTH_MAP = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
};

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  className = "",
  overlayClassName = "",
  maxWidth = "lg",
  closeOnEsc = true,
  closeOnBackdropClick = true,
  initialFocusRef,
  ariaLabel,
  showCloseButton = true,
}) => {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

  /**
   * A per-instance id for `aria-labelledby`.
   *
   * It used to be the literal `"modal-title"`, so two dialogs produced two elements with that id and
   * a screen reader read whichever the DOM resolved first — possibly the dialog underneath.
   */
  const reactId = useId();
  const titleId = `${reactId}-title`;

  // Re-render whenever the stack changes, so `isTopmost` and `aria-modal` follow it.
  useSyncExternalStore(subscribeToStack, stackSnapshot, stackSnapshot);
  const isTopmost = openDialogs[openDialogs.length - 1] === reactId;

  /**
   * Callbacks and options are read through refs so the effect below can depend on nothing but
   * `isOpen`. With `onClose` in its dependency list it re-ran on **every host render** — callers pass
   * inline closures — and 50 ms later re-took focus, so a click on a second button (or typing in a
   * field) was undone by any state change in the dialog. Same arrangement as
   * `useAudioEngineInstance`: current callbacks, stable effect.
   */
  const isTopmostRef = useRef(isTopmost);
  isTopmostRef.current = isTopmost;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeOnEscRef = useRef(closeOnEsc);
  closeOnEscRef.current = closeOnEsc;

  useEffect(() => {
    if (!isOpen) return;
    pushDialog(reactId);
    return () => removeDialog(reactId);
  }, [isOpen, reactId]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement;

    const timer = setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length > 0) {
          focusable[0].focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only the dialog on top reacts. Otherwise one Escape closes the entire stack, and two Tab
      // traps pull focus in opposite directions — out of the dialog the user is actually in.
      if (!isTopmostRef.current) return;

      if (e.key === "Escape" && closeOnEscRef.current) {
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusables = Array.from(
          modalRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );

        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === modalRef.current) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      if (previouslyFocusedElementRef.current && typeof previouslyFocusedElementRef.current.focus === "function") {
        previouslyFocusedElementRef.current.focus();
      }
    };
  }, [isOpen, initialFocusRef, reactId]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal={isTopmost}
      aria-label={ariaLabel || (typeof title === "string" ? title : undefined)}
      aria-labelledby={!ariaLabel && title ? titleId : undefined}
      className={`fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md animate-fade-in ${overlayClassName}`}
      onClick={(e) => {
        if (closeOnBackdropClick && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`bg-[#12141a] border border-line rounded-2xl w-full ${MAX_WIDTH_MAP[maxWidth]} shadow-[0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col focus:outline-none animate-slide-up ${className}`}
        onClick={(e) => e.stopPropagation()}
      >
        {(title || showCloseButton) && (
          <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-[#1f222b]">
            <div>
              {title && (
                <h3 id={titleId} className="font-['Space_Grotesk'] text-base font-bold text-text">
                  {title}
                </h3>
              )}
              {description && (
                <p className="text-[11px] text-text-sub mt-0.5">
                  {description}
                </p>
              )}
            </div>
            {showCloseButton && (
              <button
                onClick={onClose}
                aria-label="Close modal"
                className="p-1.5 rounded-lg hover:bg-[#1a1c22] text-text-sub hover:text-text transition-colors ml-auto"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {children}
      </div>
    </div>
  );
};
