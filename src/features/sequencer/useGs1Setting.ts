import { useCallback, useSyncExternalStore } from "react";
import type { AudioEngine } from "../../audio/AudioEngine";
import { isGs1RoutingEnabled, setGs1RoutingEnabled, subscribeGs1Routing } from "../../audio/gs1/gs1Tracks";

/**
 * One source of truth for the GS-1 ("new architecture voices") switch.
 *
 * The switch is module state that the schedulers read, and three separate surfaces display it:
 * the studio toolbar chip, the settings panel's audio tab, and the About tab. Before this hook
 * each surface mirrored the value in its own `useState`, which is exactly how a switch ends up
 * showing ON in one place and OFF in another. Subscribing to the module instead means every
 * surface re-renders together no matter who flipped it.
 *
 * Writes go through the engine when there is one, because the engine owns persistence
 * (`groove_audio_settings_v1`) and the host teardown that turning it off must trigger.
 */
export function useGs1Setting(engine: AudioEngine | null): [boolean, (enabled: boolean) => void] {
  const enabled = useSyncExternalStore(subscribeGs1Routing, isGs1RoutingEnabled, isGs1RoutingEnabled);
  const setEnabled = useCallback(
    (next: boolean) => {
      if (engine) {
        engine.setGs1Enabled(next);
        return;
      }
      // No engine yet (first paint): still reflect the choice in the UI and in the schedulers.
      setGs1RoutingEnabled(next);
    },
    [engine]
  );
  return [enabled, setEnabled];
}
