import React from "react";
import type { AudioEngine, DrumKitType } from "../../audio/AudioEngine";
import { useLanguage } from "../../i18n/LanguageContext";
import { ConsolePanel, type ConsolePanelStore } from "./ConsolePanel";

export interface ConsoleOverlayProps {
  /** When false (or the engine is not ready yet) nothing is rendered at all. */
  isOpen: boolean;
  /**
   * The studio's live engine. The overlay deliberately accepts `null` so it can be
   * mounted before the engine exists without ever constructing one of its own.
   */
  engine: AudioEngine | null;
  /** The studio's live sequencer store. */
  store: ConsolePanelStore;
  drumKit?: DrumKitType;
  isPlaying?: boolean;
  onToggleTransport?: () => void;
  /** "Back to the studio" affordance forwarded to the panel (standalone parity). */
  onOpenStudio?: () => void;
  /** Required: the drawer must always be dismissible. */
  onClose: () => void;
}

/**
 * Floating mixing console (调音台) drawn over the groove studio.
 *
 * This is the linking surface between the two views: it renders the very same
 * `ConsolePanel` the standalone `/console` route renders, but with the studio's
 * engine and store injected, so both views mix the same audio graph and the same
 * pattern state. It renders nothing while closed, so the studio's transport and
 * grid stay fully usable behind it.
 *
 * Escape handling lives in `useTransportShortcuts` (the studio's single keyboard
 * owner) so the drawer and the studio's other overlays cannot fight over the key.
 */
export const ConsoleOverlay: React.FC<ConsoleOverlayProps> = ({
  isOpen,
  engine,
  store,
  drumKit,
  isPlaying,
  onToggleTransport,
  onOpenStudio,
  onClose,
}) => {
  const { t } = useLanguage();

  if (!isOpen || !engine) return null;

  return (
    <div
      data-testid="console-overlay"
      className="fixed inset-0 z-50 flex items-end justify-center"
    >
      {/* Backdrop: clicking anywhere outside the desk dismisses it. */}
      <div
        data-testid="console-overlay-backdrop"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        data-testid="console-overlay-panel"
        aria-label={t("console_title")}
        className="relative max-h-[88vh] w-full overflow-y-auto border-t border-accent/40 bg-bg shadow-[0_-12px_48px_rgba(0,0,0,0.6)]"
      >
        <ConsolePanel
          engine={engine}
          store={store}
          drumKit={drumKit}
          isPlaying={isPlaying}
          onToggleTransport={onToggleTransport}
          onOpenStudio={onOpenStudio}
          onClose={onClose}
          variant="overlay"
        />
      </div>
    </div>
  );
};
