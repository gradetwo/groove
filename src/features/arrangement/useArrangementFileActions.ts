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
import type { ArrangementV2, NoteEvent } from "../../types/arrangementV2";
import { useLanguage } from "../../i18n/LanguageContext";
import { announcer } from "../../platform/announcer";
import {
  alsFileFor,
  describeError,
  downloadProducedFile,
  grooveFileFor,
  importArrangementFile,
  importMusicXmlIntoArrangement,
  midiFileFor,
  mp3FileFor,
  musicXmlFileFor,
  stemsFileFor,
  wavFileFor,
  type ArrangementImportOutcome,
  type ProducedAudio,
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
  /** A chosen file, dispatched by its own extension. */
  importFile: (file: File) => void;
  /** A chosen MusicXML document, which the toolbar's own input deliberately does not accept. */
  importMusicXml: (file: File) => void;
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

  /** An import's outcome as the sentence the toolbar shows; a refusal carries the reader's own reason. */
  const reportImport = useCallback(
    (outcome: ArrangementImportOutcome) => {
      if (!outcome.ok) {
        say(t("arrangement_import_failed", { error: outcome.reason }));
        return;
      }
      onArrangement(outcome.arrangement);
      say(`${t("arrangement_import_done", { filename: outcome.filename, tracks: outcome.tracks, notes: outcome.notes })}${problemsTail(outcome.problems)}`);
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

  const importFile = useCallback(
    (file: File) => {
      void (async () => {
        setBusy(true);
        try {
          reportImport(await importArrangementFile(arrangement, file));
        } finally {
          setBusy(false);
        }
      })();
    },
    [arrangement, reportImport]
  );

  const importMusicXml = useCallback(
    (file: File) => {
      void (async () => {
        setBusy(true);
        try {
          reportImport(await importMusicXmlIntoArrangement(arrangement, file));
        } finally {
          setBusy(false);
        }
      })();
    },
    [arrangement, reportImport]
  );

  return { report, busy, exportMidi, exportAls, exportGroove, exportWav, exportMp3, exportStems, exportMusicXml, importFile, importMusicXml };
}
