/**
 * **The arrangement's door**: the Export menu and the Import entry, in the global toolbar.
 *
 * Both shapes are copied from the studio toolbar rather than invented — `Toolbar.tsx`'s `ExportMenu` (its own open
 * state, its own outside-click listener, `aria-haspopup`/`aria-expanded`, and a hidden `input[type=file]` that is
 * cleared after every pick) is the pattern the owner already reads on `/`. What is different here is only what the
 * entries do, and that every one of them is honest: `onExportX` is only offered while it can produce a file, and the
 * import's `accept` names exactly the formats the reader underneath can actually parse.
 *
 * It carries `ml-auto` so the group sits at the **right end** of the toolbar, after Zoom — and that is deliberately
 * the same mechanism the editor tabs use, so when the tabs are showing the two groups share the right edge rather
 * than fighting for it.
 */
import { memo, useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileAudio, FolderKanban, Layers, Loader2, Package, Upload } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/** ⭐ `m:ss` left, from the fraction and the elapsed seconds the renderer's own callback carries. */
const remainingLabel = (progress: { fraction: number; elapsedSec: number }): string => {
  const remaining = Math.max(1, Math.round((progress.elapsedSec * (1 - progress.fraction)) / Math.max(0.01, progress.fraction)));
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
};

export interface ArrangementFileEntriesV2Props {
  /** True while a render or a read is in flight, so the menu reports that it is working instead of looking idle. */
  busy?: boolean;
  onExportMidi: () => void;
  onExportAls: () => void;
  onExportGroove: () => void;
  onExportWav: () => void;
  onExportMp3: () => void;
  onExportStems: () => void;
  /** The chosen file. The input is this component's only because a click has to start somewhere. */
  onImportFile: (file: File) => void;  /**
   * ⭐ **Which export is running, or `undefined`.** The arrangement exporters report "working" rather than a percentage, so
   * this is what the control can honestly say; a bar that cannot move is the kind of control this repository removes.
   */
  exportingKind?: string;
  /** ⭐ The renderer's own fraction, when the running export can report one (WAV currently). */
  exportProgress?: { fraction: number; elapsedSec: number };
  /** ⭐ True from the moment cancel is pressed until the renderer is actually free (finding L01). */
  exportStopping?: boolean;
  /** ⭐ Stop waiting for it: the run finishes, the file is not written. */
  onCancelExport?: () => void;
}

/** The toolbar's own button, at the toolbar's own 44 px — the surface is a phone surface too. */
const BUTTON = "h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text disabled:opacity-50 flex items-center gap-1";
const ITEM = "w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-text-sub hover:text-text hover:bg-[#1a1d26] transition-colors";

export const ArrangementFileEntriesV2 = memo(function ArrangementFileEntriesV2({
  busy = false,
  onExportMidi,
  onExportAls,
  onExportGroove,
  onExportWav,
  onExportMp3,
  onExportStems,
onImportFile,
  exportingKind,
  exportProgress,
  exportStopping = false,
  onCancelExport,}: ArrangementFileEntriesV2Props) {
  const { t } = useLanguage();
  const [exportOpen, setExportOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  /** The same outside-click rule the workbench's menu uses: a menu that stays open behind another press hides the button that opened it. */
  useEffect(() => {
    if (!exportOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setExportOpen(false);
    };
    window.addEventListener("pointerdown", handleClickOutside);
    return () => window.removeEventListener("pointerdown", handleClickOutside);
  }, [exportOpen]);

  const run = (action: () => void) => () => {
    action();
    setExportOpen(false);
  };

  return (
    <span data-testid="arrangement-file-entries" className="relative ml-auto flex shrink-0 items-center gap-1">
      {(exportingKind !== undefined || exportStopping) && (
        <span data-testid="arrangement-export-progress" className="font-mono text-[10px] uppercase tracking-widest text-text-sub">
          {/**
            * ⭐ **Said rather than simulated** (finding L01): the cancel abandons the result, not the render, so until the
            * run's `finally` the interface says it is still stopping. The percentage is gone with the abandoned result —
            * a moving number would suggest the work is the thing being wound down.
            */}
          {exportStopping ? t("arrangement_export_stopping") : t("arrangement_exporting")}
          {!exportStopping && exportProgress !== undefined && exportProgress.fraction >= 0.03
            ? ` ${Math.round(exportProgress.fraction * 100)}% · ${t("arrangement_export_eta", { time: remainingLabel(exportProgress) })}`
            : ""}
        </span>
      )}
      {exportingKind !== undefined && !exportStopping && onCancelExport !== undefined && (
        <button
          type="button"
          data-testid="arrangement-export-cancel"
          onClick={onCancelExport}
          className="h-11 shrink-0 rounded border border-[rgb(var(--d-line))] px-2 text-xs text-text hover:text-accent"
        >
          {t("arrangement_export_cancel")}
        </button>
      )}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          data-testid="arrangement-export-menu"
          onClick={() => setExportOpen((previous) => !previous)}
          disabled={busy}
          className={BUTTON}
          /* Its own label, exactly as the workbench records: `toolbar_export_menu` is "Export", not the name of one of its items. */
          title={t("toolbar_export_menu")}
          aria-label={t("toolbar_export_menu")}
          aria-haspopup="true"
          aria-expanded={exportOpen}
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <Download className="h-3.5 w-3.5" />}
          <span>{t("toolbar_export_menu")}</span>
          <ChevronDown className={`h-3 w-3 transition-transform ${exportOpen ? "rotate-180" : ""}`} />
        </button>

        {exportOpen && (
          <div
            data-testid="arrangement-export-items"
            className="absolute right-0 top-full z-50 mt-1.5 w-56 divide-y divide-line/40 rounded-xl border border-line-strong bg-[#0f1118] py-1 font-['JetBrains_Mono'] text-xs shadow-[0_16px_36px_rgba(0,0,0,0.9)]"
          >
            <div className="space-y-0.5 p-1">
              <button type="button" data-testid="arrangement-export-midi" onClick={run(onExportMidi)} className={ITEM}>
                <Download className="h-3.5 w-3.5 shrink-0 text-accent" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_midi")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_midi")}</span>
                </div>
              </button>
              <button type="button" data-testid="arrangement-export-als" onClick={run(onExportAls)} className={ITEM}>
                <Layers className="h-3.5 w-3.5 shrink-0 text-[#fbbf24]" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_als")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_als")}</span>
                </div>
              </button>
              <button type="button" data-testid="arrangement-export-groove" onClick={run(onExportGroove)} className={ITEM}>
                <FolderKanban className="h-3.5 w-3.5 shrink-0 text-accent" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_groove")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_groove")}</span>
                </div>
              </button>
            </div>

            <div className="space-y-0.5 p-1">
              <button type="button" data-testid="arrangement-export-wav" onClick={run(onExportWav)} className={ITEM}>
                <FileAudio className="h-3.5 w-3.5 shrink-0 text-[#38bdf8]" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_wav")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_wav")}</span>
                </div>
              </button>
              <button type="button" data-testid="arrangement-export-mp3" onClick={run(onExportMp3)} className={ITEM}>
                <FileAudio className="h-3.5 w-3.5 shrink-0 text-[#a78bfa]" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_mp3")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_mp3")}</span>
                </div>
              </button>
              <button type="button" data-testid="arrangement-export-stems" onClick={run(onExportStems)} className={ITEM}>
                <Package className="h-3.5 w-3.5 shrink-0 text-[#a78bfa]" />
                <div className="flex flex-col">
                  <span className="font-medium text-text">{t("toolbar_export_stems")}</span>
                  <span className="text-[10px] text-text-dim">{t("arrangement_export_hint_stems")}</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </div>

      {/*
        The hidden input, cleared after every pick — `Toolbar.tsx`'s Import does the same, and for a reason: without it a
        second pick of the *same* file fires no `change` event, so an import that failed once cannot be retried.
      */}
      <input
        ref={importRef}
        data-testid="arrangement-import-input"
        type="file"
        accept=".mid,.midi,.groove,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onImportFile(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        data-testid="arrangement-import"
        onClick={() => importRef.current?.click()}
        disabled={busy}
        className={BUTTON}
        title={t("arrangement_import_title")}
        aria-label={t("arrangement_import_title")}
      >
        <Upload className="h-3.5 w-3.5" />
        <span>{t("arrangement_import_label")}</span>
      </button>
    </span>
  );
});
