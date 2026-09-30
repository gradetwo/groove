/**
 * The arrangement track header: Bitwig's documented minimum set, in the order Bitwig's manual states it.
 *
 * `docs/ARRANGEMENT_UI_DESIGN.md` §2 tabulates what each DAW puts in a track header and adopts Bitwig's ordering
 * because **it is the only one written down as an order** in a manual: colour strip → kind icon → name → volume →
 * record-arm → solo → mute → level meter. REAPER's "hide controls as the column narrows" is deliberately *not*
 * adopted; the brief's phone section moves mute/solo/record-arm behind one 44 px disclosure instead of shrinking
 * them, because a 24 px target is a mouse-scale target (WCAG 2.5.5/2.5.8).
 *
 * The instrument slot sits on the header as well (§6.1): our SFZ sampler needs a named chip ("Salamander Grand
 * Piano") where Cubase puts configurable track controls and where FL binds an instrument with Track Mode. Depth is
 * one click, never a separate lane and never a floating window.
 *
 * **The header owns no rules.** Muting, soloing, arming and setting a level are all reported to the caller, which
 * calls the same pure functions the rest of the arrangement calls — the discipline every block in this view
 * follows, and the reason a track that is muted on screen cannot be audible in the engine.
 */
import { InstrumentBrowserV2 } from "./InstrumentBrowserV2";
import type { InstrumentChoice } from "./TrackListV2";
import { useLanguage } from "../../i18n/LanguageContext";
import type { TrackKindV2, TrackV2 } from "../../types/arrangementV2";

export interface TrackHeaderV2Props {
  track: TrackV2;
  /** Depth in its Track Stack, so what is drawn cannot disagree with `parentId`. */
  depth?: number;
  /** Which row has its instrument library open. One at a time: two panels would make the column jump height. */
  libraryOpen?: boolean;
  onLibraryOpenChange?: (trackId: string, open: boolean) => void;
  instruments?: readonly InstrumentChoice[];
  onChangeInstrument?: (trackId: string, assetId: string) => void;
  onToggle?: (trackId: string, flag: "muted" | "soloed", value: boolean) => void;
  onToggleArm?: (trackId: string, armed: boolean) => void;
  onChangeGain?: (trackId: string, gainDb: number) => void;
  onChangeKind?: (trackId: string, kind: TrackKindV2) => void;
  onRemoveTrack?: (trackId: string) => void;
  onToggleCollapse?: (trackId: string, collapsed: boolean) => void;
}

/**
 * The colour a track's strip carries when the model does not name one.
 *
 * A fixed table rather than a per-track random or a rainbow: the strip is what makes a track recognisable at a
 * glance, and a value that changed between renders would be a worse identity marker than none. The tokens are the
 * app's own `--d-*` accents, so a skin change reaches them.
 */
const KIND_COLOR: Record<TrackKindV2, string> = {
  sampler: "var(--d-accent)",
  instrument: "#5ac8fa",
  drumkit: "#f5b73d",
  fx: "#b07cff",
  folder: "#8a8f98",
};

/** The kind icon. Text rather than an SVG: this component is on the entry route's import graph. */
const KIND_ICON: Record<TrackKindV2, string> = {
  sampler: "♪",
  instrument: "𝄞",
  drumkit: "▦",
  fx: "≈",
  folder: "▸",
};

export function TrackHeaderV2({
  track,
  depth = 0,
  libraryOpen = false,
  onLibraryOpenChange,
  instruments = [],
  onChangeInstrument,
  onToggle,
  onToggleArm,
  onChangeGain,
  onChangeKind,
  onRemoveTrack,
  onToggleCollapse,
}: TrackHeaderV2Props) {
  const { t } = useLanguage();
  const gain = track.gainDb ?? 0;
  // The strip carries the track's own colour when it has one, and the kind's colour otherwise — so a colour is
  // never invented for a track that declared none.
  const color = track.color ?? KIND_COLOR[track.kind];
  const canPlayInstrument = track.kind === "sampler" && onChangeInstrument !== undefined && instruments.length > 0;

  return (
    <div
      data-testid={`track-${track.id}`}
      data-depth={depth}
      data-kind={track.kind}
      /*
        The header is a toolbar because that is what the brief asks for (§7: "each control in the track header uses
        `toolbar`/`switch`/`slider`"). The name is its accessible name, so a screen reader in a column of headers
        hears which track it has landed on.
      */
      role="toolbar"
      aria-label={t("track_header_label", { name: track.name })}
      className="relative flex shrink-0 items-center gap-1 px-1"
      style={{ height: "var(--arr-track-h)", paddingLeft: `${4 + depth * 12}px` }}
    >
      {/* 1 — the colour strip. The brief's first item, and the only thing that identifies a track without reading. */}
      <span data-control="color" data-testid={`track-color-${track.id}`} aria-hidden="true" className="h-8 w-1 shrink-0 rounded" style={{ background: color }} />

      {/* 2 — the kind icon, which is also the kind chooser: a track's type is a decision, not an identity. */}
      {onChangeKind ? (
        <select
          data-control="kind"
          data-testid={`track-kind-${track.id}`}
          aria-label={`${track.name} kind`}
          value={track.kind}
          onChange={(event) => onChangeKind(track.id, event.target.value as TrackKindV2)}
          className="h-7 w-8 shrink-0 rounded border border-[var(--d-line)] bg-transparent text-center text-xs text-text"
        >
          {(["sampler", "instrument", "drumkit", "fx", "folder"] as const).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_ICON[kind]}
            </option>
          ))}
        </select>
      ) : (
        <span data-control="kind" data-testid={`track-kind-${track.id}`} aria-hidden="true" className="w-4 shrink-0 text-center text-xs text-text opacity-80">
          {KIND_ICON[track.kind]}
        </span>
      )}

      {/* 3 — the name, which is also which track is selected. It takes the leftover width rather than a fixed one, so
          a header with more controls gives the name less room instead of overflowing the column; a button, so a
          keyboard can select a track too. */}
      <span data-control="name" className="flex min-w-0 flex-1 items-center gap-1">
        {onToggleCollapse && track.kind === "folder" && (
          <button
            type="button"
            aria-label={`${track.name} ${track.collapsed ? t("expand") : t("fold")}`}
            aria-expanded={!track.collapsed}
            data-testid={`track-fold-${track.id}`}
            onClick={() => onToggleCollapse(track.id, !track.collapsed)}
            className="h-7 w-6 shrink-0 rounded text-xs text-text opacity-80"
          >
            {track.collapsed ? "▸" : "▾"}
          </button>
        )}
        <span data-testid={`track-name-${track.id}`} className="min-w-0 truncate text-xs text-text" style={{ flex: "1 1 2rem" }} title={track.name}>
          {track.name}
        </span>
      </span>

      {/* 4 — the volume, with its number beside it: a slider says "a bit quieter", the number says how much. */}
      <span data-control="volume" className="arr-head-desktop-only flex shrink-0 items-center gap-1">
        {onChangeGain && (
          <input
            type="range"
            min={-60}
            max={12}
            step={0.5}
            value={gain}
            aria-label={t("track_volume_label", { name: track.name })}
            data-testid={`track-gain-${track.id}`}
            onChange={(event) => onChangeGain(track.id, Number(event.target.value))}
            className="w-14 accent-[var(--d-accent)]"
          />
        )}
        <span data-testid={`track-gain-value-${track.id}`} className="w-10 text-right font-['JetBrains_Mono'] text-[9px] text-text opacity-70">
          {gain.toFixed(1)}
        </span>
      </span>

      {/*
        5 — record-arm. It is a persistent flag on the track (like `muted`/`soloed`), not view state, so a track that
        is armed says so to anyone who asks and the button cannot drift from it. **It does not yet change where a
        recording lands** — the recording path still puts the take on the selected track — which is stated here
        rather than implied by a control that looks like it does more than it does.
      */}
      {onToggleArm && (
        <button
          type="button"
          data-control="arm"
          aria-label={t("track_arm_label", { name: track.name })}
          aria-pressed={Boolean(track.armed)}
          data-testid={`track-arm-${track.id}`}
          onClick={() => onToggleArm(track.id, !track.armed)}
          className={`arr-head-desktop-only h-5 w-5 shrink-0 rounded-full border text-[9px] leading-none ${
            track.armed ? "border-danger bg-danger text-[var(--d-on-accent)]" : "border-[var(--d-line)] text-text"
          }`}
        >
          ●
        </button>
      )}

      {/* 6 and 7 — solo, then mute. `S` and `M` as the accessible name as well as the label: those letters are what
          a professional reaches for, and the surrounding tests already address them by that name. The brief keeps
          solo ahead of mute, and it is not cosmetic: solo overrides mute, so reading order matches precedence. */}
      {onToggle && (
        <>
          <button
            type="button"
            data-control="solo"
            aria-label="S"
            aria-pressed={Boolean(track.soloed)}
            data-testid={`track-solo-${track.id}`}
            onClick={() => onToggle(track.id, "soloed", !track.soloed)}
            className={`arr-head-desktop-only h-5 w-5 shrink-0 rounded text-[9px] ${
              track.soloed ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border border-[var(--d-line)] text-text"
            }`}
          >
            S
          </button>
          <button
            type="button"
            data-control="mute"
            aria-label="M"
            aria-pressed={Boolean(track.muted)}
            data-testid={`track-mute-${track.id}`}
            onClick={() => onToggle(track.id, "muted", !track.muted)}
            className={`arr-head-desktop-only h-5 w-5 shrink-0 rounded text-[9px] ${
              track.muted ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "border border-[var(--d-line)] text-text"
            }`}
          >
            M
          </button>
        </>
      )}

      {/*
        The phone's stand-in for mute, solo and record-arm: **one** control, at 44 px, rather than three controls
        shrunk below a finger. See `docs/ARRANGEMENT_UI_DESIGN.md` §2 ("we deliberately differ"): REAPER hides
        controls as the column narrows and that is unacceptable on touch, so they move behind a disclosure.

        The controls inside carry their own `-touch` test ids, so the desktop header and the phone drawer are two
        subtrees that a criterion can address separately instead of one ambiguous query.
      */}
      {onToggle && (
        <details className="arr-head-msr relative shrink-0" data-testid={`track-msr-${track.id}`}>
          <summary
            aria-label={t("track_msr_label", { name: track.name })}
            className="flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded border border-[var(--d-line)] text-[10px] text-text"
          >
            M/S/R
          </summary>
          <div className="absolute right-0 top-full z-30 flex flex-col gap-1 rounded border border-[var(--d-line)] bg-[var(--d-panel,rgba(20,20,24,0.98))] p-1">
            {onToggleArm && (
              <button
                type="button"
                aria-label={t("track_arm_label", { name: track.name })}
                aria-pressed={Boolean(track.armed)}
                data-testid={`track-arm-touch-${track.id}`}
                onClick={() => onToggleArm(track.id, !track.armed)}
                className={`h-11 w-11 rounded-full border text-[10px] ${track.armed ? "border-danger bg-danger text-[var(--d-on-accent)]" : "text-text"}`}
              >
                R
              </button>
            )}
            <button
              type="button"
              aria-label={t("track_solo_label", { name: track.name })}
              aria-pressed={Boolean(track.soloed)}
              data-testid={`track-solo-touch-${track.id}`}
              onClick={() => onToggle(track.id, "soloed", !track.soloed)}
              className={`h-11 w-11 rounded text-[10px] ${track.soloed ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "text-text"}`}
            >
              S
            </button>
            <button
              type="button"
              aria-label={t("track_mute_label", { name: track.name })}
              aria-pressed={Boolean(track.muted)}
              data-testid={`track-mute-touch-${track.id}`}
              onClick={() => onToggle(track.id, "muted", !track.muted)}
              className={`h-11 w-11 rounded text-[10px] ${track.muted ? "bg-[var(--d-accent)] text-[var(--d-accent-ink)]" : "text-text"}`}
            >
              M
            </button>
          </div>
        </details>
      )}

      {/* 8 — the level meter, last as Bitwig's order has it. It is a **picture**: nothing measures a live level on
          this route, so the bar shows unity and the slot is where real metering will land. aria-hidden, because a
          decorative bar with a number in it would be read as a measurement it is not. */}
      <span data-control="meter" data-testid={`track-meter-${track.id}`} aria-hidden="true" className="flex h-8 w-1.5 shrink-0 items-end overflow-hidden rounded-sm bg-[var(--d-line)]">
        <span className="block w-full" style={{ height: "70%", background: color }} />
      </span>

      {/*
        The instrument slot, after Bitwig's eight because it is ours rather than part of their documented set.

        It is a **flex item, not an overlay**: absolutely positioned in the bottom corner it landed on the level meter
        and, at this column's width, on the volume slider as well — and a control that cannot be clicked is worse than
        one that is absent, because nothing says why. As a flex item it either fits or the name gives up space to it,
        which is what the `min-w-0` on the name is for.
      */}
      {canPlayInstrument && (
        <span data-control="instrument" className="min-w-0 max-w-[8rem]">
          <InstrumentBrowserV2
            trackId={track.id}
            trackName={track.name}
            {...(track.sample?.assetId ? { assetId: track.sample.assetId } : {})}
            instruments={instruments}
            onChangeInstrument={onChangeInstrument!}
            open={libraryOpen}
            onOpenChange={(open) => onLibraryOpenChange?.(track.id, open)}
          />
        </span>
      )}

      {onRemoveTrack && (
        <button
          type="button"
          data-control="remove"
          aria-label={t("track_remove_label", { name: track.name })}
          data-testid={`track-remove-${track.id}`}
          onClick={() => onRemoveTrack(track.id)}
          className="h-5 w-5 shrink-0 rounded text-xs text-text opacity-70"
        >
          ×
        </button>
      )}
    </div>
  );
}
