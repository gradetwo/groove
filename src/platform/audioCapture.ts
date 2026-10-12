/**
 * "Record what I hear" — capture the master output so a listener can hand over the signal.
 *
 * Six rounds of this work went into detectors that measured a *stem render* and disagreed with the person hearing the app
 * (see `docs/SYNTH_UPSTREAM_PLAN.md` §1g: five metrics, four of which flagged normal musical shapes as defects). The
 * missing instrument was never another detector — it was the owner's own audio. This is how they get it.
 *
 * Deliberately a **MediaRecorder tap**, not a sample-accurate renderer:
 *
 * * it captures what the audio graph actually outputs, in the live path, at the same nodes the ears are on — which is the
 *   whole point, since the offline stem is what kept disagreeing;
 * * it does no work on the main thread beyond the codec's own, so it cannot itself be the source of a glitch it is meant to
 *   report (a `ScriptProcessorNode` would run on the main thread and could);
 * * the container is whatever the browser records natively (Opus/WebM on Chrome, AAC/MP4 on Safari), which is fine because
 *   the file is for a person to send and for `ffmpeg` to read — not for our gates.
 */
import { getActiveAudioEngine } from "../audio/activeEngine";

export interface CaptureResult {
  blob: Blob;
  filename: string;
  /** How long was actually recorded (the caller asked for a bound, the recorder can stop early). */
  seconds: number;
}

/** The containers browsers actually offer, best first: smaller files, then Safari's. */
const PREFERRED_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

/** The mime type this browser will accept, or `""` for "let it choose" (an old Safari). */
export function pickRecorderMimeType(isSupported: (type: string) => boolean): string {
  for (const type of PREFERRED_TYPES) {
    try {
      if (isSupported(type)) return type;
    } catch {
      /* A browser that throws on an unknown type simply cannot take it. */
    }
  }
  return "";
}

/** The file extension for a recorded mime type, so the file opens where the listener expects it to. */
export function extensionForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "m4a";
  if (mimeType.includes("ogg")) return "ogg";
  return "webm";
}

/**
 * Record the master output for `seconds` and resolve with the file.
 *
 * Rejects with a readable message when there is nothing to record from — a page with no engine, or an engine whose
 * context has not been started — because "the button did nothing" is the failure this whole feature exists to avoid.
 */
export async function captureMasterAudio(seconds = 10): Promise<CaptureResult> {
  const engine = getActiveAudioEngine();
  const tap = engine?.getCaptureTap();
  if (!engine || !tap) throw new Error("no running audio engine to record from");
  const ctx = tap.context;
  if (typeof MediaRecorder === "undefined") throw new Error("this browser cannot record audio");

  //  is typed as `BaseAudioContext`, which does not carry the media-stream factory in the DOM lib even
  // though every browser that has `MediaRecorder` also has it.
  const destination = (ctx as AudioContext).createMediaStreamDestination();
  const mimeType = pickRecorderMimeType((type) => MediaRecorder.isTypeSupported(type));
  const recorder = new MediaRecorder(destination.stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("the recorder failed"));
  });

  // Tap the master. `connect` fans out rather than stealing the signal, so playback is unaffected.
  tap.connect(destination);
  const started = Date.now();
  try {
    recorder.start();
    await new Promise((resolve) => setTimeout(resolve, Math.max(1, seconds) * 1000));
    if (recorder.state !== "inactive") recorder.stop();
    await finished;
  } finally {
    // Always unhook: a diagnostic that leaves a node connected would be a bug of its own.
    try {
      tap.disconnect(destination);
    } catch {
      /* already gone */
    }
  }

  const type = recorder.mimeType || mimeType || "audio/webm";
  const blob = new Blob(chunks, { type });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return {
    blob,
    filename: `groove-capture-${stamp}.${extensionForMimeType(type)}`,
    seconds: (Date.now() - started) / 1000,
  };
}
