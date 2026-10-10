/**
 * The arrangement's file entries, as the interface uses them: **one sentence out, and the arrangement in**.
 *
 * `arrangementFiles.ts` produces and reads files; this binds that to the two things a view has — a translator and a way
 * to install a new arrangement — and turns every outcome, success or failure, into the one line the toolbar shows. It
 * is the arrangement's answer to the workbench's `useExportActions`, and it follows the same rule that made that hook
 * worth having: **the person is told what happened**, including that a rendered master fell back to a different
 * limiter, rather than being handed a file and left to notice.
 *
 * Every handler is `void`-returning because a button's `onClick` cannot await; the promise is caught inside, which is
 * also why `busy` exists — an offline render takes seconds and a menu that looks idle while it works is a lie.
 */
import { useCallback, useState, useRef } from "react";
import { arrangementNoteCount } from "../../data/arrangementToLogic";
import { logicFileFor } from "./arrangementFiles";
import type { ArrangementV2, NoteEvent } from "../../types/arrangementV2";
import { useLanguage } from "../../i18n/LanguageContext";
import { announcer } from "../../platform/announcer";
import {
  alsFileFor,
  arrangementFileKind,
  describeError,
  downloadProducedFile,
  grooveFileFor,
  importArrangementFile,
  midiFileFor,
  mp3FileFor,
  musicXmlFileFor,
  placeMidiIntoArrangement,
  placeMusicXmlIntoArrangement,
  readMidiForImport,
  readMusicXmlForImport,
  stemsFileFor,
  wavFileFor,
  type ArrangementImportOutcome,
  type ProducedAudio,
  type ReadMidiImport,
  type ReadMusicXmlImport,
} from "./arrangementFiles";

export interface UseArrangementFileActionsOptions {
  arrangement: ArrangementV2;
  /** Install the arrangement an import produced. The view owns the value; this hook only decides what it becomes. */
  onArrangement: (next: ArrangementV2) => void;
  /** The notes the Score tab is reading — what the MusicXML export writes. */
  scoreNotes: readonly NoteEvent[];
  scoreBars: number;
  /** The track name the score is titled with, which also names the file. */
  scoreTitle?: string;
  /**
   * ⭐ **The project's song, read when an export runs** (third evaluation F09/§6): the sections and the chain that orders
   * them, so a `.groove` written here carries the structure the arrangement view is playing. Absent, or incomplete, means
   * the file carries no `song` field at all.
   */
  currentSong?: () => { chain: string[]; sections: unknown[] } | undefined;
}

export interface UseArrangementFileActionsResult {
  /** The last thing an entry did, in a sentence. Rendered, so no failure is silent and no success is invisible. */
  report?: string;
  busy: boolean;
  /**
   * ⭐ **Which export is running, or `undefined`.** The percentage beside it is measured (see the state's note): the WAV
   * render calls back through `WavExporter`'s 10% seams, so this is a moving number rather than a control that cannot.
   */
  exportingKind?: string;
  /** ⭐ The render's own fraction and elapsed seconds, while a WAV export that can report them is running. */
  exportProgress?: { fraction: number; elapsedSec: number };
  /**
   * ⭐ **A cancelled export is still running until it is not** (third evaluation, L01): the browser's offline render
   * cannot be interrupted, so a cancel abandons the *result* while the work carries on. This is true from the press until
   * the run's `finally`, which is the only honest moment to say the machine is free.
   */
  exportStopping: boolean;
  /** ⭐ Stop waiting: the work finishes, the file is not written. `OfflineAudioContext` has no cancellation primitive. */
  cancelExport: () => void;
  exportMidi: () => void;
  exportAls: () => void;
  exportGroove: () => void;
  exportWav: () => void;
  exportMp3: () => void;
  exportStems: () => void;
  exportMusicXml: () => void;
  /** Delivered as a zip named logicx.zip: a logicx is a directory and a browser hands over one file. */
  exportLogic: () => void;
  /** A chosen file, dispatched by its own extension. */
  importFile: (file: File) => void;
  /** A chosen MusicXML document, which the toolbar's own input deliberately does not accept. */
  importMusicXml: (file: File) => void;
  /**
   * ⭐ **A file with more than one part, read and waiting for the person to name its parts.** Absent unless the
   * mapping dialog should be up; the view renders it from this value, which is what keeps "a dialog is open" and
   * "these are the parts being imported" one fact rather than two.
   */
  pendingMapping?: PendingImportMapping;
  /** The person's per-part instrument names, then the import — the same placement the no-answer path uses. */
  confirmMapping: (instruments: Record<number, string>) => void;
  /** Import with nothing named. An action, said out loud, rather than a dismissal that leaves no trace. */
  skipMapping: () => void;
}

/** What the mapping dialog is drawn for: the file's own name, and each part as the reader reported it. */
export interface PendingImportMapping {
  filename: string;
  /** The part names **verbatim** and the note counts the reader measured — the two facts the row shows. */
  parts: Array<{ name: string; notes: number }>;
}

/**
 * ⭐ **A read file waiting for the person to name its parts, and which reader produced it.**
 *
 * The dialog asks one question of both formats — "what is each of these parts?" — and the answer is applied by the
 * placement that belongs to the reader that produced the parts. Carrying the kind rather than two separate pending
 * slots is what keeps "a dialog is open" one fact: two slots could both be filled, and then the view would have to
 * decide which one it is showing.
 *
 * MusicXML was the format that had no entry here at all and no `instruments` parameter to reach this point — see
 * `placeMusicXmlIntoArrangement`.
 */
type PendingImport = { kind: "midi"; read: ReadMidiImport } | { kind: "musicxml"; read: ReadMusicXmlImport };

/**
 * The parts that will become tracks and were left unnamed — the list the report names out loud.
 *
 * It reads the **part list the dialog was drawn from**, so the sentence about what is still a synthesizer is about
 * the very parts that were placed, and it counts only parts with notes because that is what `arrangementWithImportedParts`
 * turns into tracks.
 */
function unnamedParts(parts: ReadonlyArray<{ name: string; notes: readonly unknown[] }>, instruments?: Record<number, string>): string[] {
  return parts.filter((part, index) => part.notes.length > 0 && (instruments?.[index] ?? "") === "").map((part) => part.name);
}

export function useArrangementFileActions({
  arrangement,
  onArrangement,
  scoreNotes,
  scoreBars,
  scoreTitle,
  currentSong,
}: UseArrangementFileActionsOptions): UseArrangementFileActionsResult {
  const { t } = useLanguage();
  const [report, setReport] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  /**
   * ⭐ **Which export is running, and whether the one in flight is still wanted.**
   *
   * The same idiom `useExportActions` uses, and for the same measured reason: `OfflineAudioContext.startRendering()` has no
   * cancellation primitive, so the only honest guarantee is about the **file** — after a cancel, none is produced. The counter
   * is how a run learns it is stale: `cancelExport` moves it on, and the run that was in flight finds itself behind.
   *
   * ⭐ **A percentage is reported now, because one is measured**: `WavExporter` calls back at each 10% through the
   * `OfflineAudioContext.suspend` seams and `wavFileFor` forwards it, so the label moves with the render instead of
   * claiming to. The older note here said no percentage was reported "because none was measured" — true when written,
   * and the measurement is what changed.
   */
  const [exportingKind, setExportingKind] = useState<string | undefined>(undefined);
  /**
   * ⭐ **How far the render is, and how long it has been going.** A five-minute bounce takes minutes, and "Exporting…"
   * alone is the difference between waiting and wondering whether it hung. The fraction comes from the renderer itself.
   */
  const [exportProgress, setExportProgress] = useState<{ fraction: number; elapsedSec: number } | undefined>(undefined);
  /**
   * ⭐ **"Stopping" is a state, because the work does not stop** (third evaluation, L01).
   *
   * The evaluation read this hook and said what its own comment already admitted: `cancelExport` only stops the *result*
   * from being applied — `startRendering` cannot be interrupted — so a button that goes quiet the instant it is pressed
   * tells the person the CPU is free when it is not. The flag is raised on cancel and lowered in the run's `finally`,
   * which is the first moment the work is genuinely over.
   */
  const [exportStopping, setExportStopping] = useState(false);
  const runIdRef = useRef(0);
  /** ⭐ Which run was cancelled, so its own `finally` is what lowers the flag — no other run can clear it. */
  const cancelledRunRef = useRef<number | undefined>(undefined);
  /** The file waiting for the person to name its parts, if the mapping dialog should be up. */
  const [pending, setPending] = useState<PendingImport | undefined>(undefined);

  /** One place that publishes, so what is on screen and what a screen reader hears cannot diverge. */
  const say = useCallback((message: string) => {
    setReport(message);
    announcer.announce(message);
  }, []);

  /** The problems a reader or writer reported, as the tail of the sentence rather than as a second message. */
  const problemsTail = useCallback(
    (problems: readonly string[]) =>
      problems.length === 0 ? "" : ` · ${t("arrangement_file_problems", { count: problems.length, detail: problems.slice(0, 3).join("; ") })}`,
    [t]
  );

  /** The one-line report for a rendered master, with the same degradation ladder the workbench's exports use. */
  const audioReport = useCallback(
    (result: ProducedAudio) => {
      if (result.workletsUnavailable) return t("export_wav_no_worklets", { filename: result.filename });
      if (result.gs1HostFailures > 0) return t("export_wav_degraded_gs1", { filename: result.filename, count: result.gs1HostFailures });
      if (result.limiterKind === "fallback") return t("export_wav_degraded_limiter", { filename: result.filename });
      if (result.kind === "mp3") return t("export_mp3_done", { filename: result.filename, kbps: result.bitrateKbps ?? 192 });
      if (result.kind === "stems") return t("export_stems_done", { filename: result.filename });
      return t("export_wav_done", { filename: result.filename });
    },
    [t]
  );

  /**
   * An import's outcome as the sentence the toolbar shows; a refusal carries the reader's own reason.
   *
   * ⭐ **`unnamed` is the tail the mapping dialog made possible and necessary**: an import that named no instrument
   * for a part leaves that track a built-in synthesizer, and a person who skipped the dialog must be able to read
   * that back — with the next step attached, because "these tracks have no instrument" on its own is not something
   * anyone can act on. It is empty for a non-MIDI import and for an import that named every part.
   */
  const reportImport = useCallback(
    (outcome: ArrangementImportOutcome, unnamed: readonly string[] = []) => {
      if (!outcome.ok) {
        say(t("arrangement_import_failed", { error: outcome.reason }));
        return;
      }
      onArrangement(outcome.arrangement);
      const unassigned =
        unnamed.length === 0
          ? ""
          : ` · ${t("arrangement_import_unassigned", { count: unnamed.length, names: unnamed.slice(0, 3).join(", ") })}`;
      /**
       * ⭐ **The mapping that landed is said out loud, not left to be inferred from eight kind selects.** The owner's
       * acceptance path is *import, map, play*, and a person who just named every part has to be able to read back
       * that the names took: the sentence names the count, and the sampler-only instrument slot beside each track is
       * the second, independent way to see it.
       */
      const mapped = outcome.mapped === undefined ? "" : ` · ${t("arrangement_import_mapped", { count: outcome.mapped })}`;
      say(
        `${t("arrangement_import_done", { filename: outcome.filename, tracks: outcome.tracks, notes: outcome.notes })}${problemsTail(outcome.problems)}${mapped}${unassigned}`
      );
    },
    [onArrangement, problemsTail, say, t]
  );

  const exportMidi = useCallback(() => {
    try {
      const file = midiFileFor(arrangement);
      downloadProducedFile(file);
      const summary = t("arrangement_export_summary", { tracks: file.tracks, notes: file.notes });
      say(`${t("export_midi_done", { name: file.filename.replace(/\.mid$/, "") })} · ${summary}${problemsTail(file.problems)}`);
    } catch (error) {
      say(t("arrangement_export_failed", { error: describeError(error) }));
    }
  }, [arrangement, problemsTail, say, t]);

  /**
   * Every async entry runs the same shape: mark busy, produce, download, say what happened, and stop being busy —
   * including when it throws, because a renderer left spinning after a failure is the silent half of a broken export.
   */
  const run = useCallback(
    async (kind: string, work: () => Promise<{ report: string; file?: { filename: string; blob: Blob } }>) => {
      setBusy(true);
      const myRun = (runIdRef.current += 1);
      setExportingKind(kind);
      /**
       * ⭐ **Give the browser one turn to paint "Exporting…" before the render takes the thread** (Web functional test of
       * v2.35.9: *"導出 MP3/WAV 要等渲染：點擊後無進度提示"*).
       *
       * Measured with `scratch/probe-export-progress.mjs` at 1512 px: the progress row is real — `Exporting…` then
       * `10 % · ~59s left`, `20 % · ~27s left` — but it first appears at **6.66 s**, and the probe's own 250 ms sampling
       * loop was *also* blocked until then. A state that is set and cannot be painted is indistinguishable from no state at
       * all, and the click was answered by a frozen interface for those seconds. Yielding here costs one frame and buys the
       * sentence the user needs: the work started and it is this long.
       */
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        const result = await work();
        // ⭐ A cancelled run produces nothing: the files are the only guarantee this can honestly make.
        if (runIdRef.current !== myRun) return;
        if (result.file) downloadProducedFile(result.file);
        say(result.report);
      } catch (error) {
        say(t("arrangement_export_failed", { error: describeError(error) }));
      } finally {
        setBusy(false);
        /**
         * ⭐ **This is the first moment the renderer is free** (finding L01), which is why both the progress readout and
         * the stopping state are cleared here rather than in `cancelExport`.
         */
        if (runIdRef.current === myRun || cancelledRunRef.current === myRun) {
          setExportingKind(undefined);
          setExportProgress(undefined);
        }
        if (cancelledRunRef.current === myRun) {
          cancelledRunRef.current = undefined;
          setExportStopping(false);
        }
      }
    },
    [say, t]
  );

  const exportAls = useCallback(() => {
    void run("export", async () => {
      const file = await alsFileFor(arrangement);
      return { file, report: t("export_als_done", { filename: file.filename }) };
    });
  }, [arrangement, run, t]);

  const exportGroove = useCallback(() => {
    void run("export", async () => {
      /**
       * ⭐ **Read at export time, not at mount**: whether there is a song — and which sections it has — is a fact about
       * the project as it stands when the person clicks, so a getter is the honest shape for it.
       */
      const file = await grooveFileFor(arrangement, undefined, currentSong?.());
      return { file, report: t("export_groove_done", { name: file.name }) };
    });
  }, [arrangement, run, t]);

  const exportWav = useCallback(() => {
    void run("export", async () => {
      const file = await wavFileFor(arrangement, (fraction, elapsedSec) => setExportProgress({ fraction, elapsedSec }));
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportMp3 = useCallback(() => {
    void run("export", async () => {
      const file = await mp3FileFor(arrangement);
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportStems = useCallback(() => {
    void run("export", async () => {
      const file = await stemsFileFor(arrangement);
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportMusicXml = useCallback(() => {
    if (scoreNotes.length === 0) {
      say(t("arrangement_musicxml_empty"));
      return;
    }
    void run("export", async () => {
      const file = await musicXmlFileFor(scoreNotes, scoreBars, {
        ...(scoreTitle === undefined ? {} : { title: scoreTitle }),
        ...(arrangement.timeSignature === undefined ? {} : { timeSignature: arrangement.timeSignature }),
        ...(arrangement.bpm === undefined ? {} : { tempoBpm: arrangement.bpm }),
      });
      return { file, report: t("arrangement_musicxml_export_done", { filename: file.filename, notes: file.notes }) };
    });
  }, [arrangement.bpm, arrangement.timeSignature, run, say, scoreBars, scoreNotes, scoreTitle, t]);

  const exportLogic = useCallback(() => {
    /**
     * The guard asks whether **any** track holds notes, because `logicFileFor` below writes the whole arrangement: the
     * score tab's notes are one track, and refusing on an empty selected track would hide an export that has content
     * elsewhere. The empty sentence is this export's own rather than the MusicXML one (docs/OPEN_WORK.md 294).
     */
    const totalNotes = arrangementNoteCount(arrangement);
    if (totalNotes === 0) {
      say(t("arrangement_logic_empty"));
      return;
    }
    void run("export", async () => {
      /**
       * The completion sentence is this export's own (`arrangement_logic_export_done`), unlike the empty-note guard
       * above, which still says the MusicXML one — recorded in docs/OPEN_WORK.md 294 rather than left to look right.
       */
      const file = logicFileFor(arrangement);
      return { file, report: t("arrangement_logic_export_done", { filename: file.filename, notes: file.notes }) };
    });
  }, [arrangement, run, say, t]);

  const importFile = useCallback(
    (file: File) => {
      /**
       * ⭐ **A MIDI file is read first and placed second**, because a `.mid` with more than one part is the one import
       * whose parts arrive anonymous and whose identity only a person knows. The read is the same `fromMidi` the
       * single-part path uses, so the dialog describes exactly the parts that will be placed — not a second parse
       * that could disagree.
       *
       * A **single-part** file places straight away: one part is not a table, and a dialog with one row would be a
       * press that changes nothing. That is also the path that keeps the pre-dialog behaviour for such files.
       */
      if (arrangementFileKind(file.name) === "midi") {
        void (async () => {
          setBusy(true);
          try {
            const read = await readMidiForImport(file);
            if (!read.ok) {
              say(t("arrangement_import_failed", { error: read.reason }));
              return;
            }
            const withNotes = read.read.imported.parts.filter((part) => part.notes.length > 0).length;
            if (withNotes > 1) {
              setPending({ kind: "midi", read: read.read });
              return;
            }
            reportImport(placeMidiIntoArrangement(arrangement, read.read), unnamedParts(read.read.imported.parts));
          } finally {
            setBusy(false);
          }
        })();
        return;
      }
      void (async () => {
        setBusy(true);
        try {
          reportImport(await importArrangementFile(arrangement, file));
        } finally {
          setBusy(false);
        }
      })();
    },
    [arrangement, reportImport, say, t]
  );

  /**
   * ⭐ **The read file placed by the reader that produced it, with the names a person gave.**
   *
   * One dispatch for both formats, because the dialog is one dialog and the answer is one answer: the only thing the
   * kind decides is which `place…IntoArrangement` applies it. Both take `(arrangement, read, instruments)` keyed by
   * part index, so nothing here re-keys or reorders anything.
   */
  const placePending = useCallback(
    (read: PendingImport, instruments?: Record<number, string>): ArrangementImportOutcome =>
      read.kind === "midi"
        ? placeMidiIntoArrangement(arrangement, read.read, instruments)
        : placeMusicXmlIntoArrangement(arrangement, read.read, instruments),
    [arrangement]
  );

  /**
   * The person's answer: place the read file with the names keyed by part index — the very shape
   * `arrangementWithImportedParts` takes, so nothing here re-keys or reorders it.
   */
  const confirmMapping = useCallback(
    (instruments: Record<number, string>) => {
      const read = pending;
      if (!read) return;
      setPending(undefined);
      reportImport(placePending(read, instruments), unnamedParts(read.read.imported.parts, instruments));
    },
    [pending, placePending, reportImport]
  );

  /** Skipping places the same read file with no names at all — today's result, reached by a press. */
  const skipMapping = useCallback(() => {
    const read = pending;
    if (!read) return;
    setPending(undefined);
    reportImport(placePending(read), unnamedParts(read.read.imported.parts));
  }, [pending, placePending, reportImport]);

  /**
   * ⭐ **A MusicXML document, read first and placed second — the same two-step the MIDI entry above takes.**
   *
   * This is the half of the mapping gap that was missing: the reader always returned every part, and the entry point
   * the Score tab calls had no way to ask what those parts are. A file with more than one part that holds notes opens
   * the mapping dialog (the shared `ImportInstrumentMappingV2`); a single-part file places straight away, exactly as
   * the MIDI path already decided for the same reason — one part is not a table.
   *
   * **The refusal is said with the reader's own sentence**, and the single-part path still reports the parts it left
   * unnamed, so "these tracks play a built-in synthesizer" is readable for a file the dialog never opened for.
   */
  const importMusicXml = useCallback(
    (file: File) => {
      void (async () => {
        setBusy(true);
        try {
          const read = await readMusicXmlForImport(file);
          if (!read.ok) {
            say(t("arrangement_import_failed", { error: read.reason }));
            return;
          }
          const withNotes = read.read.imported.parts.filter((part) => part.notes.length > 0).length;
          if (withNotes > 1) {
            setPending({ kind: "musicxml", read: read.read });
            return;
          }
          reportImport(placeMusicXmlIntoArrangement(arrangement, read.read), unnamedParts(read.read.imported.parts));
        } finally {
          setBusy(false);
        }
      })();
    },
    [arrangement, reportImport, say, t]
  );

  /**
   * The dialog's own value: the file's name and its parts as rows. Derived from the read rather than stored twice, so
   * "the dialog is open" and "these parts will be placed" cannot disagree.
   */
  const pendingMapping: PendingImportMapping | undefined =
    pending === undefined
      ? undefined
      : {
          filename: pending.read.filename,
          parts: pending.read.imported.parts.map((part) => ({ name: part.name, notes: part.notes.length })),
        };

  /**
   * ⭐ **Stop waiting for the run that is in flight.** The work itself finishes — `startRendering` cannot be interrupted — but
   * its file is not written and its percentage is not shown, which is what a person pressing cancel is asking for.
   */
  const cancelExport = useCallback(() => {
    cancelledRunRef.current = runIdRef.current;
    runIdRef.current += 1;
    /**
     * ⭐ **The progress goes, the truth stays** (finding L01): the percentage belongs to the abandoned result, but the
     * work is still running, so the interface keeps saying so until the run's `finally` clears it.
     */
    setExportProgress(undefined);
    setExportStopping(true);
  }, []);

  return {
    report,
    exportingKind,
    exportProgress,
    exportStopping,
    cancelExport,
    busy,
    exportMidi,
    exportAls,
    exportGroove,
    exportWav,
    exportMp3,
    exportStems,
    exportMusicXml,
    exportLogic,
    importFile,
    importMusicXml,
    ...(pendingMapping === undefined ? {} : { pendingMapping }),
    confirmMapping,
    skipMapping,
  };
}
