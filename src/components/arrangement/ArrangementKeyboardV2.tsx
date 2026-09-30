/**
 * A keyboard for playing an arrangement's sampler tracks by hand.
 *
 * **Why it exists**: a sampler track could be created, given one of the mirrored instruments, and never sounded by hand — the SFZ path resolved a note to a sample and a rate and nothing called it. The owner's request was direct: without note input there is no way
 * to test a real instrument at all. This is the inline half of that (the piano roll that *writes* notes is the other half, and the next piece of work).
 *
 * **The key layout is shared with the v1 studio's musical typing**, imported rather than copied: a key map is knowledge, and two copies drift the moment one gains a key. What differs is the surface — this is a strip under the track list rather than a
 * full-screen modal with velocity, gate and chord controls, because a person testing an instrument wants to press a key and hear it, not to configure a note.
 *
 * It reports **note on and note off separately**, because a sampler's sample is held: the release is what stops it, and a keyboard that only sent note-on would leave every key ringing.
 */
import { useCallback, useEffect, useState } from "react";
import { BLACK_KEYS, WHITE_KEYS } from "../sequencer/musicalTypingKeys";
import { midiToNoteName } from "../sequencer/PitchPickerModal";
import { useLanguage } from "../../i18n/LanguageContext";

export interface ArrangementKeyboardV2Props {
  /** The note the leftmost white key is, so a part written in another register is reachable. Defaults to middle C. */
  baseMidi?: number;
  /** Pressed. The parent resolves the instrument and sounds it. */
  onNoteOn: (midi: number, velocity: number) => void;
  /** Released. The parent stops that key's voices. */
  onNoteOff: (midi: number) => void;
  /**
   * The velocity each press carries. A fixed value would make every note the same, which is not what a keyboard is for; this is a slider so a person can hear a sampler's velocity layers — the drum kit's regions are layered at 31/63/95/127 and a
   * keyboard stuck at one value would only ever sound one of them.
   */
  velocity?: number;
}

/** One octave and a half of white keys is the layout the shared map defines: enough to hear a part without hunting. */
export function ArrangementKeyboardV2({ baseMidi = 60, onNoteOn, onNoteOff, velocity = 100 }: ArrangementKeyboardV2Props) {
  const { t } = useLanguage();
  const [held, setHeld] = useState<Set<number>>(new Set());
  const [level, setLevel] = useState(velocity);

  const press = useCallback(
    (midi: number) => {
      setHeld((current) => {
        // A repeated press of a key already down must not start a second voice: key auto-repeat sends `keydown` many times a second.
        if (current.has(midi)) return current;
        const next = new Set(current);
        next.add(midi);
        onNoteOn(midi, level);
        return next;
      });
    },
    [level, onNoteOn]
  );

  const release = useCallback(
    (midi: number) => {
      setHeld((current) => {
        if (!current.has(midi)) return current;
        const next = new Set(current);
        next.delete(midi);
        onNoteOff(midi);
        return next;
      });
    },
    [onNoteOff]
  );

  /**
   * The computer keyboard. Bound to the window because this strip has no focus of its own, and **ignored while a text field has focus** — otherwise typing a track name would play a chord.
   */
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      const tag = element?.tagName?.toLowerCase();
      return tag === "input" || tag === "textarea" || tag === "select" || element?.isContentEditable === true;
    };
    const keyToMidi = new Map<string, number>();
    for (const key of [...WHITE_KEYS, ...BLACK_KEYS]) keyToMidi.set(key.key, baseMidi + key.offset);

    const down = (event: KeyboardEvent) => {
      if (event.repeat || isTyping(event.target)) return;
      const midi = keyToMidi.get(event.key.toLowerCase());
      if (midi === undefined) return;
      press(midi);
    };
    const up = (event: KeyboardEvent) => {
      const midi = keyToMidi.get(event.key.toLowerCase());
      if (midi === undefined) return;
      release(midi);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [baseMidi, press, release]);

  return (
    <div data-testid="arrangement-keyboard" className="flex flex-col gap-2 p-3 rounded border border-[var(--d-border,rgba(255,255,255,0.15))]">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-text opacity-80">{t("keyboard_hint")}</span>
        <label className="flex items-center gap-2 text-xs text-text opacity-80">
          {t("keyboard_velocity")}
          <input
            type="range"
            min={1}
            max={127}
            value={level}
            aria-label={t("keyboard_velocity")}
            onChange={(event) => setLevel(Number(event.target.value))}
            className="w-24"
          />
          <span data-testid="keyboard-velocity-value" className="w-8 text-right font-['JetBrains_Mono']">
            {level}
          </span>
        </label>
      </div>
      <div className="relative h-20 select-none rounded bg-[#0c0e12]" style={{ width: "100%" }}>
        <div className="relative flex h-full w-full">
          {WHITE_KEYS.map(({ key, offset }) => {
            const midi = baseMidi + offset;
            const active = held.has(midi);
            return (
              <button
                key={`white-${key || offset}`}
                type="button"
                aria-label={`${midiToNoteName(midi)} (${key || "—"})`}
                data-testid={`arrangement-key-${midi}`}
                data-active={active ? "true" : "false"}
                onPointerDown={() => press(midi)}
                onPointerUp={() => release(midi)}
                onPointerLeave={() => release(midi)}
                style={{ flex: "1 0 auto" }}
                className={`relative flex-1 rounded-b border-r border-[#b0b3ba] text-[9px] font-bold ${
                  active ? "bg-[var(--d-accent)] text-black" : "bg-gradient-to-b from-white to-[#e0e2e8] text-[#1c1f26]"
                }`}
              >
                <span className="font-['JetBrains_Mono']">{midiToNoteName(midi)}</span>
              </button>
            );
          })}
        </div>
        {/* The black keys are positioned by the white key they sit after, which is what makes the bed read as a keyboard. */}
        {BLACK_KEYS.map(({ key, offset, leftPercent }) => {
          const midi = baseMidi + offset;
          const active = held.has(midi);
          return (
            <button
              key={`black-${key || offset}`}
              type="button"
              aria-label={`${midiToNoteName(midi)} (${key || "—"})`}
              data-testid={`arrangement-key-${midi}`}
              data-active={active ? "true" : "false"}
              onPointerDown={() => press(midi)}
              onPointerUp={() => release(midi)}
              onPointerLeave={() => release(midi)}
              style={{ left: `${leftPercent}%`, width: `${Math.max(4, 60 / WHITE_KEYS.length)}%` }}
              className={`absolute top-0 h-[62%] rounded-b ${active ? "bg-[var(--d-accent)]" : "bg-[#1c1f26]"}`}
            />
          );
        })}
      </div>
    </div>
  );
}
