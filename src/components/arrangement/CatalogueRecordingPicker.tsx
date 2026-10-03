/**
 * **The catalogue recording a track plays** — the chooser the genre route never had.
 *
 * ## Why this exists
 *
 * `/new` could already pick any of the catalogue's program assets: `NewProjectView` loads the runtime, keeps the
 * assets that carry an SFZ, and hands them to the arrangement, where a `sampler` track's instrument chip opens
 * `InstrumentLibraryV2`. A genre lane could not. Its timbre picker goes by **instrument name**
 * (`InstrumentPicker` over `INSTRUMENT_PRESET_ALIASES`), and a name reaches a recording only when
 * `src/data/sampledInstruments.ts` has a hand-written row for it — twenty-two names, mapped by a judgement made in
 * code. The measured consequence: of the 327 program-level assets the shipped manifest declares, **48 are reachable
 * through a palette row or the drum-kit constant and 279 are not**, so a composer in a genre could not choose 279 of
 * the recordings the repository already ships.
 *
 * The engine had the mechanism all along. `sampledAssetForLane` asks three sources in order, and the **first is the
 * lane's own `sample.assetId`** for the melodic roles — the field `SequencerTrack` has carried (and `projectDb`
 * has persisted) since the audio-lane work. Nothing wrote it in the studio. This file is the part that writes it,
 * plus the list it is written from.
 *
 * ## The four rules it follows, each of which is a criterion
 *
 *   · **The list is the catalogue's, not a copy of it.** `instrumentChoicesFromAssets` reads the same assets
 *     `appCatalogueRuntime.load()` resolved from `public/samples/manifest.json` — "an instrument is an asset with an
 *     SFZ" is the catalogue's own definition, and the same function builds the list `/new` uses.
 *   · **The choice really changes what plays.** It writes `sample.assetId`, which is the first branch of
 *     `sampledAssetForLane`, so the criterion can assert against that function rather than against component state —
 *     the discipline `sampledInstrumentPaletteWiring.test.ts` states as *"a row that `sampledInstrumentFor` can find
 *     but `sampledAssetForLane` does not return is a mapping no lane plays."*
 *   · **It is offered only where the engine honours it.** A drum role's or an `fx` lane's `sample` is refused by
 *     `sampledAssetForLane` on purpose, so the chip is not drawn there: a control whose value nothing reads is worse
 *     than no control.
 *   · **An empty catalogue says why.** With no mirror configured there is no list to show, and a button that opens
 *     an empty browser is the defect `trackInstrumentChooser.test.tsx` exists to prevent — so the reason is drawn
 *     instead, in `src/data/sampleCatalogueStatus.ts`'s own words.
 */
import { useEffect, useMemo, useState } from "react";
import { InstrumentLibraryV2 } from "./InstrumentLibraryV2";
import { libraryOfAsset, type InstrumentChoice } from "./TrackListV2";
import { SAMPLED_ROLES, sampledAssetForLane } from "../../data/sampledInstruments";
import type { SampleAsset } from "../../data/sampleCatalogue";
import type { CatalogueStatus } from "../../data/sampleCatalogueStatus";
import { useSampledCoverage } from "../../hooks/useSampledCoverage";
import {
  notesOutsideCoverage,
  writtenNotesOf,
  writtenRange,
} from "../../features/sampledCoverage/sampledKeyCoverage";
import type { ProgramTextSource } from "../../features/sampledCoverage/programText";
import { describeCoverage, outsideRangeText, writtenRangeText } from "./coverageLabel";
import { useLanguage } from "../../i18n/LanguageContext";
import type { SequencerTrack } from "../../types/genre";

/**
 * The catalogue's assets as the chooser's list — **the one mapping**, used by this picker and by `/new`.
 *
 * It moved here from `NewProjectView` unchanged, so the route that already had a picker and the route that is
 * getting one cannot disagree about what an instrument is. An asset is an instrument when the manifest gives it an
 * SFZ: a plain one-shot sample is a sound, not something a melodic lane can be told to play note by note. The
 * library comes from the id because a multi-instrument library names its programs `entry:program`.
 */
export function instrumentChoicesFromAssets(assets: readonly SampleAsset[]): InstrumentChoice[] {
  return assets
    .filter((asset) => asset.sfz)
    .map((asset) => ({
      assetId: asset.assetId,
      name: asset.name,
      library: libraryOfAsset(asset.assetId),
      // The category the manifest declares, absent when it does not — the panel then groups by library rather than
      // inventing a word.
      ...(asset.category ? { category: asset.category } : {}),
      ...(asset.subcategory ? { subcategory: asset.subcategory } : {}),
    }));
}

/**
 * Whether a lane's `track_id` is one the engine honours a `sample.assetId` for.
 *
 * **Asked here rather than by a second list**, because the answer is written in `sampledAssetForLane`: it returns
 * the lane's own asset when the role is `audio` or one of `SAMPLED_ROLES`, and refuses it for a drum role or an
 * effect. The chooser is offered exactly where that returns a value, so this predicate and the resolver cannot drift:
 * the roles named here are `src/data/sampledInstruments.ts`'s own constant, not a copy.
 */
export function laneAcceptsCatalogueRecording(role: string | undefined): boolean {
  const id = (role ?? "").trim().toLowerCase();
  return id === "audio" || SAMPLED_ROLES.includes(id);
}

export interface CatalogueRecordingPickerProps {
  /** The track this belongs to, named in the chip and its accessible name. */
  trackName: string;
  /** The lane's role — v1's `track_id`. Only a role the engine honours gets a chooser. */
  role: string | undefined;
  /** The recording the lane plays today, when it has chosen one of its own. */
  assetId?: string;
  instruments: readonly InstrumentChoice[];
  /**
   * The catalogue's own state, from `describeRuntimeStatus`. It is what the empty case says instead of showing a
   * list — and the sentences are the data layer's, so "not set up" and "set up and broken" stay distinguishable.
   */
  status: CatalogueStatus;
  /** The choice, or `null` to put the lane back on the name table / its synthesised voice. */
  onChoose: (assetId: string | null) => void;
  /**
   * ⭐ **The catalogue the list came from**, so a coverage reading can find each asset's program address.
   *
   * Absent means **no coverage is shown at all** — the panel then behaves exactly as it did before this prop existed,
   * which is what keeps every existing caller and criterion unchanged. Present, it is the address book only: which
   * keys an asset sounds still comes from the engine, through {@link useSampledCoverage}.
   */
  assets?: readonly SampleAsset[];
  /** Injected program text, for a criterion. Default: the catalogue's own fetch through the engine's include expander. */
  programText?: ProgramTextSource;
  /**
   * ⭐ **The lane this panel belongs to**, so its written notes can be measured against the recording.
   *
   * The asset is resolved through `sampledAssetForLane`, not read off the `assetId` prop: a genre lane carries no
   * `sample.assetId` and still plays a recording through the palette, and reporting a lane whose written line falls
   * outside that recording is the whole reason this block exists.
   */
  lane?: SequencerTrack;
}

export function CatalogueRecordingPicker({
  trackName,
  role,
  assetId,
  instruments,
  status,
  onChoose,
  assets,
  programText,
  lane,
}: CatalogueRecordingPickerProps) {
  const { isZh } = useLanguage();
  const [open, setOpen] = useState(false);

  /**
   * ⭐ **The engine reading, requested for the lane's own recording.**
   *
   * Called before the role guard below, because a hook cannot be skipped on a render path; the guard's own answer is
   * read again from the same predicate, so a lane the engine would ignore still renders nothing.
   */
  const coverageLookup = useSampledCoverage(assets ?? [], { ...(programText === undefined ? {} : { programText }) });
  const laneAssetId = lane ? sampledAssetForLane(lane) : undefined;
  /** The recording that will actually sound: the lane's own if it names one, otherwise the palette's. */
  const reportAssetId = laneAssetId ?? assetId;
  const written = useMemo(() => (lane ? writtenNotesOf(lane) : []), [lane]);
  const range = useMemo(() => writtenRange(written), [written]);
  const distinctPitches = useMemo(() => new Set(written.map((note) => note.pitch)).size, [written]);
  const reportAsset = assets?.find((candidate) => candidate.assetId === reportAssetId);
  const program = coverageLookup.programOf(reportAssetId);
  /**
   * The engine's per-note refusals — **not** a comparison against `range`. A hole inside the printed span (MTG 39–76
   * with no 41–43) is exactly the case a min/max test would miss, so each written note is asked about at its own
   * velocity (`notesOutsideCoverage`).
   */
  const outside = useMemo(
    () => (reportAsset?.sfz && program !== undefined ? notesOutsideCoverage(reportAsset, program, written) : undefined),
    [reportAsset, program, written]
  );
  useEffect(() => {
    coverageLookup.request(reportAssetId);
    // `assets` is a dependency because the catalogue arrives asynchronously: a request answered "not in this catalogue"
    // while it was still loading must be asked again once it is here, or the panel would stay failed for the session.
  }, [coverageLookup, reportAssetId, assets]);

  // A lane the engine would ignore gets nothing: see `laneAcceptsCatalogueRecording`.
  if (!laneAcceptsCatalogueRecording(role)) return null;

  const offered = instruments.length > 0;
  const current = assetId === undefined ? undefined : instruments.find((instrument) => instrument.assetId === assetId);
  /**
   * The current recording's name, or its id when this catalogue does not carry it.
   *
   * The id rather than a blank is the honest answer: a lane can name a recording the current mirror does not serve
   * (`sampledInstrumentGap` exists to report exactly that), and showing "choose one" over a lane that already has one
   * would be the chip disagreeing with the engine.
   */
  const currentLabel = current?.name ?? assetId;
  const label = isZh ? "录音" : "Recording";

  return (
    <aside
      data-testid="lane-recording"
      data-role={role}
      data-has-recording={assetId === undefined ? "false" : "true"}
      aria-label={`${trackName} ${label}`}
      /**
       * Phones: a bar across the top, above the inspector's bottom sheet (`z-50`) so it is never hidden behind it.
       * Desktop: a card docked to the top-right, beside the inspector's left-hand column — the position Logic puts
       * its Library in. It is top-anchored rather than full-height so a closed chooser is one line, not an empty
       * column.
       */
      className="fixed inset-x-0 top-0 z-[60] max-h-[70vh] overflow-y-auto rounded-b-2xl border-b border-line bg-panel p-2 shadow-2xl lg:inset-x-auto lg:right-0 lg:w-[360px] lg:max-h-[100dvh] lg:rounded-b-none lg:rounded-bl-2xl lg:border-b-0 lg:border-l lg:z-40"
    >
      <div className="flex items-center gap-2">
        <span className="shrink-0 font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-text-dim">
          {label}
        </span>
        <span data-testid="lane-recording-track" className="min-w-0 flex-1 truncate text-[11px] text-text">
          {trackName}
        </span>
        {offered ? (
          <button
            type="button"
            data-testid="lane-recording-open"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="min-w-0 max-w-[60%] shrink-0 truncate rounded border border-line bg-panel2 px-2 py-1 text-[10px] text-text transition-colors hover:border-accent/50 hover:text-accent"
          >
            {currentLabel ?? (isZh ? "选一段录音…" : "Choose a recording…")}
          </button>
        ) : (
          /**
           * **No control when there is nothing to choose, and the reason instead.** The button is absent rather than
           * disabled: a disabled button invites a click that can never be answered, while a sentence says what to
           * change. `describeRuntimeStatus` decides which sentence — unconfigured, loading, failed or empty — because
           * those four look identical from the outside and send a person to four different actions.
           */
          <span data-testid="lane-recording-unavailable" role="status" className="min-w-0 flex-1 text-right text-[10px] text-text-dim">
            {status.summary}
          </span>
        )}
      </div>

      {/**
        * ⭐ **What the recording can sound, and what this lane writes — side by side, which is the one thing the census
        * found missing everywhere (成熟产品把覆盖显示在 mapping／zone 视图里，没有一个把"这条线写到哪"并排显示).**
        *
        * The reading is the engine's; before it answers the slot says **"尚未加载"**, never a number. Only rendered when
        * the caller handed in the catalogue (`assets`) — the address book a reading needs — so a surface without one
        * shows nothing rather than a guess.
        */}
      {assets !== undefined && reportAssetId !== undefined && (
        <div className="mt-1 space-y-0.5">
          <p
            data-testid="lane-recording-coverage"
            data-coverage-status={coverageLookup.statusOf(reportAssetId)}
            title={coverageLookup.reasonOf(reportAssetId)}
            className="text-[10px] text-text-dim"
          >
            {isZh ? "该录音：" : "Recording: "}
            {describeCoverage(
              coverageLookup.statusOf(reportAssetId),
              coverageLookup.coverageOf(reportAssetId),
              isZh
            )}
          </p>
          {range && (
            <p data-testid="lane-written-range" className="text-[10px] text-text-dim">
              {writtenRangeText(range.first, range.last, written.length, distinctPitches, isZh)}
            </p>
          )}
          {outside !== undefined && outside.length > 0 && (
            // A `role="status"` rather than a silent colour: the report is the deliverable, and it must be reachable
            // without seeing the pixels.
            <p data-testid="lane-range-report" role="status" className="text-[10px] text-[rgb(var(--d-warn,245,183,61))]">
              {outsideRangeText(outside.length, coverageLookup.coverageOf(reportAssetId), isZh)}
            </p>
          )}
        </div>
      )}

      {!offered && status.detail.length > 0 && (
        <ul data-testid="lane-recording-detail" className="mt-1 list-disc pl-4 text-[10px] text-text-dim">
          {status.detail.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      {offered && currentLabel !== undefined && (
        <button
          type="button"
          data-testid="lane-recording-clear"
          onClick={() => {
            onChoose(null);
            setOpen(false);
          }}
          className="mt-1 w-full rounded border border-line bg-panel2 px-2 py-1 text-left text-[10px] text-text-sub transition-colors hover:border-accent/50 hover:text-accent"
        >
          {isZh
            ? `改回按乐器名解析（不再固定为 ${currentLabel}）`
            : `Use the track's instrument again (stop pinning ${currentLabel})`}
        </button>
      )}

      {offered && open && (
        // Escape closes the list rather than the inspector behind it: the panel is the thing that is open.
        <div
          className="mt-2"
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            event.stopPropagation();
            setOpen(false);
          }}
        >
          <InstrumentLibraryV2
            instruments={instruments}
            {...(assetId === undefined ? {} : { currentAssetId: assetId })}
            // The rows show the same engine reading the lane report uses; `undefined` here is what keeps a caller with
            // no catalogue showing no ranges at all.
            {...(assets === undefined ? {} : { coverage: coverageLookup })}
            onChoose={(chosen) => {
              onChoose(chosen);
              // A person who picked one is done: the list closes behind the choice, as it does in the track row.
              setOpen(false);
            }}
          />
        </div>
      )}
    </aside>
  );
}
