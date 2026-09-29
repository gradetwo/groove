/**
 * Capturing a performance into a take — with `getUserMedia` and `MediaRecorder` **injected**, so the rules can be checked without a microphone.
 *
 * The same seam as the OPFS store, for the same reason: a browser call reached for internally can only be tested in a browser, and the parts that go wrong are not the browser's — they are what this code
 * decides around it. Here that means three things:
 *
 *   * **the microphone is released on every path.** A stream left running is a recording light that stays on, and it is the mistake a user notices immediately and cannot fix except by closing the tab;
 *   * **a capture that never started produces no take.** A refusal goes through `classifyCaptureRefusal` and comes back as a reason, rather than as an empty take that silently replaces what was there;
 *   * **bytes that were captured but could not be stored are reported, not swallowed.** The take's arrangement entry and its bytes live in different places now, and the failure of one must not look like a
 *     successful recording of silence.
 */
import type { RecordingStore } from "./recordingStore";
import { classifyCaptureRefusal, planTakeFromCapture, type CaptureRefusal, type CaptureResult, type PlannedTake } from "../data/takePlanning";

/** The narrow slice of `MediaRecorder` this module uses. */
export interface RecorderLike {
  start(): void;
  stop(): void;
  /**
   * ⭐ A real `MediaRecorder` delivers a **`Blob`**, not an `ArrayBuffer` — a fact the type checker surfaced rather than a review. So the chunk is described by the one thing this code needs from it:
   * a way to read its bytes, which is asynchronous.
   */
  ondataavailable: ((event: { data: { arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: { error?: unknown }) => void) | null;
}

export interface CaptureDependencies {
  /** `navigator.mediaDevices.getUserMedia` in the browser; a fake in a criterion. */
  requestStream: (constraints: { audio: true }) => Promise<unknown>;
  /** `new MediaRecorder(stream)`. */
  createRecorder: (stream: unknown) => RecorderLike;
  /** `stream.getTracks().forEach((track) => track.stop())`. */
  stopStream: (stream: unknown) => void;
  store: RecordingStore;
}

export interface CaptureOptions {
  source: CaptureResult["source"];
  recordedAt?: number;
  startBar?: number;
  endBar?: number;
  label?: string;
}

export type CaptureOutcome =
  | { ok: true; reference: string; planned: PlannedTake }
  | { ok: false; refusal: CaptureRefusal; summary: string };

export async function captureTake(deps: CaptureDependencies, options: CaptureOptions): Promise<CaptureOutcome> {
  let stream: unknown;
  try {
    stream = await deps.requestStream({ audio: true });
  } catch (error) {
    // ⭐ Nothing was captured, so there is no take — and no stream to release, because none was obtained.
    const { refusal, summary } = classifyCaptureRefusal(error);
    return { ok: false, refusal, summary };
  }

  try {
    const chunks: Array<Promise<ArrayBuffer>> = [];
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const recorder = deps.createRecorder(stream);
      // Read each chunk's bytes as it arrives: the container may be released once the stream ends, and the conversion is asynchronous anyway.
      recorder.ondataavailable = (event) => chunks.push(event.data.arrayBuffer());
      recorder.onstop = () => {
        void Promise.all(chunks).then((parts) => resolve(joinChunks(parts)), reject);
      };
      recorder.onerror = (event) => reject(event.error ?? new Error("recorder error"));
      recorder.start();
      // The caller decides when to stop by calling `stop()` on this recorder; capturing a fixed length here would make every take the same length for no reason a user asked for.
      pendingStops.set(stream, () => recorder.stop());
    });

    const reference = await deps.store.put(bytes);
    const planned = planTakeFromCapture({
      bytes,
      source: options.source,
      recordedAt: options.recordedAt ?? Date.now(),
      ...(options.startBar !== undefined ? { startBar: options.startBar } : {}),
      ...(options.endBar !== undefined ? { endBar: options.endBar } : {}),
      ...(options.label ? { label: options.label } : {}),
    });
    return { ok: true, reference, planned };
  } catch (error) {
    const { refusal, summary } = classifyCaptureRefusal(error);
    return { ok: false, refusal, summary };
  } finally {
    // ⭐ On **every** path: a stream left running is a recording light that stays on, and the user's only remedy would be to close the tab.
    pendingStops.delete(stream);
    deps.stopStream(stream);
  }
}

/** How a caller ends a capture in progress: the same recorder the promise is waiting on. */
// Keyed by the stream itself: a capture in progress is the only thing that needs to be found from outside, and `finally` always deletes its entry — so nothing outlives its capture.
const pendingStops = new Map<unknown, () => void>();

export function stopCapture(stream: unknown): void {
  pendingStops.get(stream)?.();
}

function joinChunks(chunks: readonly ArrayBuffer[]): ArrayBuffer {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(new Uint8Array(chunk), offset);
    offset += chunk.byteLength;
  }
  return joined.buffer;
}
