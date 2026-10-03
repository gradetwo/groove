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
import { useCallback, useState } from "react";
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
}

export interface UseArrangementFileActionsResult {
  /** The last thing an entry did, in a sentence. Rendered, so no failure is silent and no success is invisible. */
  report?: string;
  busy: boolean;
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
}: UseArrangementFileActionsOptions): UseArrangementFileActionsResult {
  const { t } = useLanguage();
  const [report, setReport] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
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
    async (work: () => Promise<{ report: string; file?: { filename: string; blob: Blob } }>) => {
      setBusy(true);
      try {
        const result = await work();
        if (result.file) downloadProducedFile(result.file);
        say(result.report);
      } catch (error) {
        say(t("arrangement_export_failed", { error: describeError(error) }));
      } finally {
        setBusy(false);
      }
    },
    [say, t]
  );

  const exportAls = useCallback(() => {
    void run(async () => {
      const file = await alsFileFor(arrangement);
      return { file, report: t("export_als_done", { filename: file.filename }) };
    });
  }, [arrangement, run, t]);

  const exportGroove = useCallback(() => {
    void run(async () => {
      const file = await grooveFileFor(arrangement);
      return { file, report: t("export_groove_done", { name: file.name }) };
    });
  }, [arrangement, run, t]);

  const exportWav = useCallback(() => {
    void run(async () => {
      const file = await wavFileFor(arrangement);
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportMp3 = useCallback(() => {
    void run(async () => {
      const file = await mp3FileFor(arrangement);
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportStems = useCallback(() => {
    void run(async () => {
      const file = await stemsFileFor(arrangement);
      return { file, report: audioReport(file) };
    });
  }, [arrangement, audioReport, run]);

  const exportMusicXml = useCallback(() => {
    if (scoreNotes.length === 0) {
      say(t("arrangement_musicxml_empty"));
      return;
    }
    void run(async () => {
      const file = await musicXmlFileFor(scoreNotes, scoreBars, {
        ...(scoreTitle === undefined ? {} : { title: scoreTitle }),
        ...(arrangement.timeSignature === undefined ? {} : { timeSignature: arrangement.timeSignature }),
        ...(arrangement.bpm === undefined ? {} : { tempoBpm: arrangement.bpm }),
      });
      return { file, report: t("arrangement_musicxml_export_done", { filename: file.filename, notes: file.notes }) };
    });
  }, [arrangement.bpm, arrangement.timeSignature, run, say, scoreBars, scoreNotes, scoreTitle, t]);

  const exportLogic = useCallback(() => {
    if (scoreNotes.length === 0) {
      say(t("arrangement_musicxml_empty"));
      return;
    }
    void run(async () => {
      /**
       * The message is the MusicXML one, reused: it names the file and the note count, but a sentence written for
       * another format is a copy gap rather than a correct one here. Recorded in docs/OPEN_WORK.md.
       */
      const file = logicFileFor(arrangement);
      return { file, report: t("arrangement_musicxml_export_done", { filename: file.filename, notes: file.notes }) };
    });
  }, [arrangement, run, say, scoreNotes.length, t]);

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

  return {
    report,
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
