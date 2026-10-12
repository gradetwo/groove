/**
 * **Naming what an imported file's parts are** — the small per-part mapping dialog the import entry shipped without.
 *
 * The data layer has been able to do this since `arrangementWithImportedParts` learned to take
 * `{ instruments }` keyed by part index, and the interface has had no way to collect one. The measured reason that
 * matters is in `src/data/sampledInstruments.ts`: a wrong instrument is worse than a synthesiser, because it is a
 * claim about a composer's music that nobody made. So this dialog **never guesses**:
 *
 *   · it shows each part's name **verbatim, untranslated** — `钢琴` stays `钢琴`, because the name is the file's and
 *     not ours, and translating it would be the first act of the inference this dialog exists to refuse;
 *   · every row's instrument starts at **"Leave as synthesizer"**, which is what the part was before this dialog
 *     existed, so a person who names nothing gets today's result exactly;
 *   · skipping is an **explicit action** with its own button, and the arrangement then says which tracks still play
 *     built-in synthesizers and what to do about it — rather than a silent default nobody can see.
 *
 * **The shape is borrowed, not invented.** The modal is `ArrangementPanel`'s (`role="dialog"`, `aria-modal`, a themed
 * plate on a literal scrim), and the per-row control is the `<select>` the musical-typing modal already uses for
 * "Target track" — one native control with a real `aria-label`, reachable by Tab and operable by keyboard, rather
 * than a new one whose keyboard behaviour would have to be written and judged.
 *
 * **The choices are the repository's own reviewed table.** `ALL_SAMPLED_INSTRUMENTS` is the one place a name is
 * claimed to be a recording, so the dialog offers exactly that table (grouped by library) and the name it writes on
 * the track is the table's own key — the same string the MCP import takes and the same one `sampledAssetForLane`
 * resolves. The catalogue the session actually loaded is used only to **say a nicer name** for an asset; a catalogue
 * that has not loaded leaves the table's own names showing, never an empty chooser.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "../../i18n/LanguageContext";
import { ALL_SAMPLED_INSTRUMENTS } from "../../data/sampledInstruments";
import type { InstrumentChoice } from "./TrackListV2";

/** A part as the dialog shows it: the file's own name and the note count the reader measured. */
export interface ImportMappingPart {
  /** The name the file wrote, **verbatim** — no translation, no inference. */
  name: string;
  notes: number;
}

/** One recorded instrument a part may be named as. `instrument` is what is written on the track; `assetId` is what it will play. */
export interface ImportInstrumentOption {
  instrument: string;
  assetId: string;
  /** The library the asset belongs to — the part of the id before the colon, which is also the group heading. */
  library: string;
  /** The catalogue's own display name for the asset, when this session's catalogue holds it. */
  name?: string;
  /** Why this recording serves this name — the judgement from `src/data/sampledInstruments.ts`, carried for a title/hint. */
  because: string;
}

/**
 * **The options, from the written table rather than from a guess.** Deduplicated by the name that is written, sorted
 * by library then name so two opens of the dialog list them in the same order, and annotated with the loaded
 * catalogue's display name when there is one.
 */
export function importInstrumentOptions(catalogue: readonly InstrumentChoice[] = []): ImportInstrumentOption[] {
  const nameByAsset = new Map(catalogue.map((instrument) => [instrument.assetId, instrument.name]));
  const seen = new Set<string>();
  const options: ImportInstrumentOption[] = [];
  for (const choice of ALL_SAMPLED_INSTRUMENTS) {
    if (seen.has(choice.instrument)) continue;
    seen.add(choice.instrument);
    const separator = choice.assetId.indexOf(":");
    const displayName = nameByAsset.get(choice.assetId);
    options.push({
      instrument: choice.instrument,
      assetId: choice.assetId,
      library: separator === -1 ? choice.assetId : choice.assetId.slice(0, separator),
      ...(displayName === undefined ? {} : { name: displayName }),
      because: choice.because,
    });
  }
  return options.sort((a, b) => a.library.localeCompare(b.library) || a.instrument.localeCompare(b.instrument));
}

/** The options grouped by library, in the order `importInstrumentOptions` produced — what `<optgroup>` needs. */
export function groupImportInstrumentOptions(
  options: readonly ImportInstrumentOption[]
): Array<[string, ImportInstrumentOption[]]> {
  const groups = new Map<string, ImportInstrumentOption[]>();
  for (const option of options) {
    const group = groups.get(option.library);
    if (group) group.push(option);
    else groups.set(option.library, [option]);
  }
  return [...groups.entries()];
}

export interface ImportInstrumentMappingV2Props {
  /** The file being imported, named in the dialog so a person knows which pick this belongs to. */
  filename: string;
  parts: readonly ImportMappingPart[];
  /** The instruments this session's catalogue holds, so an option can be labelled with its real name. Optional. */
  catalogue?: readonly InstrumentChoice[];
  /** The person's answer, keyed by **part index**. Absent entries are left as synthesizers. */
  onConfirm: (instruments: Record<number, string>) => void;
  /** Import with nothing named — the default result, reached by a press rather than by a shrug. */
  onSkip: () => void;
}

export function ImportInstrumentMappingV2({ filename, parts, catalogue = [], onConfirm, onSkip }: ImportInstrumentMappingV2Props) {
  const { t } = useLanguage();
  /**
   * ⭐ **The default is one empty choice per part**, and it is read as "leave as synthesizer" rather than "part 1
   * gets the first instrument" — the whole point of the dialog is that nothing is filled in on the person's behalf.
   */
  const [chosen, setChosen] = useState<Record<number, string>>({});
  const firstControl = useRef<HTMLSelectElement | null>(null);

  const options = useMemo(() => importInstrumentOptions(catalogue), [catalogue]);
  const groups = useMemo(() => groupImportInstrumentOptions(options), [options]);
  const byInstrument = useMemo(() => new Map(options.map((option) => [option.instrument, option])), [options]);

  /** The first control takes focus on open, so a keyboard user is inside the dialog rather than behind it. */
  useEffect(() => {
    firstControl.current?.focus();
  }, []);

  const named = Object.values(chosen).filter((value) => value !== "");
  const confirm = () => onConfirm(Object.fromEntries(Object.entries(chosen).filter(([, value]) => value !== "").map(([index, value]) => [Number(index), value])));

  return (
    <div
      data-testid="import-instrument-mapping"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-instrument-mapping-title"
      /* Escape is the skip, not a third outcome: there is no state this dialog can leave the arrangement in other than "imported, unnamed", and saying so is the report's job. */
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onSkip();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md sm:p-4"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
        <header className="flex items-start gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="import-instrument-mapping-title" className="font-['JetBrains_Mono'] text-sm font-bold text-text">
              {t("import_mapping_title")}
            </h2>
            <p className="text-[11px] text-text-dim">{t("import_mapping_hint", { filename, parts: parts.length })}</p>
          </div>
          <button
            type="button"
            data-testid="import-mapping-close"
            onClick={onSkip}
            aria-label={t("arrangement_close")}
            title={t("arrangement_close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-panel2 text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
          >
            ✕
          </button>
        </header>

        <div className="min-h-0 overflow-y-auto px-4 py-3">
          <ul className="flex flex-col gap-2">
            {parts.map((part, index) => {
              const current = chosen[index] === undefined ? undefined : byInstrument.get(chosen[index]!);
              return (
                <li
                  key={`${index}-${part.name}`}
                  data-testid={`import-mapping-row-${index}`}
                  className="flex flex-col gap-1 rounded-lg border border-line bg-panel2/40 px-3 py-2 sm:flex-row sm:items-center sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    {/* The file's own name, verbatim. Never translated and never read as an instrument. */}
                    <p data-testid={`import-mapping-part-${index}`} className="truncate text-xs text-text" title={part.name}>
                      {part.name}
                    </p>
                    <p className="text-[10px] text-text-dim">{t("import_mapping_notes", { count: part.notes })}</p>
                  </div>
                  <div className="flex min-w-0 flex-col gap-1 sm:w-72">
                    <select
                      ref={index === 0 ? firstControl : undefined}
                      data-testid={`import-mapping-select-${index}`}
                      value={chosen[index] ?? ""}
                      aria-label={t("import_mapping_select_label", { part: part.name })}
                      onChange={(event) =>
                        setChosen((previous) => {
                          const next = { ...previous };
                          if (event.target.value === "") delete next[index];
                          else next[index] = event.target.value;
                          return next;
                        })
                      }
                      className="w-full rounded border border-line bg-panel px-2 py-1 text-xs text-text focus:outline-none focus-visible:border-accent"
                    >
                      <option value="">{t("import_mapping_keep_synth")}</option>
                      {groups.map(([library, groupOptions]) => (
                        <optgroup key={library} label={library}>
                          {groupOptions.map((option) => (
                            <option key={option.instrument} value={option.instrument} title={option.because}>
                              {/* The catalogue's name when there is one, then the table's key — which is the string written on the track. */}
                              {option.name && option.name !== option.instrument ? `${option.name} — ${option.instrument}` : option.instrument}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                    {/* What the choice will actually play: the asset id is the fact a person can check afterwards. */}
                    {current !== undefined && (
                      <p data-testid={`import-mapping-target-${index}`} className="truncate text-[10px] text-accent" title={current.because}>
                        → {current.assetId}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-4 py-3">
          <button
            type="button"
            data-testid="import-mapping-skip"
            onClick={onSkip}
            className="h-9 rounded border border-line px-3 text-xs text-text-sub transition-colors hover:text-text"
          >
            {t("import_mapping_skip")}
          </button>
          <button
            type="button"
            data-testid="import-mapping-confirm"
            onClick={confirm}
            disabled={named.length === 0}
            className="h-9 rounded border border-[rgb(var(--d-accent))] bg-[rgb(var(--d-accent))] px-3 text-xs text-black disabled:opacity-50"
          >
            {t("import_mapping_confirm", { count: named.length })}
          </button>
        </footer>
      </div>
    </div>
  );
}
