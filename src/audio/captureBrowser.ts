/**
 * The browser's own wiring — the only file in the recording path that names `navigator` or `MediaRecorder`.
 *
 * It exists to be thin. Everything decidable about a capture lives in `captureTake`, `takePlanning` and the stores, and each of those is checked with a fake in place of the browser. What is left here is
 * "pass the real things in", and the return types are what check that: if `captureTake` changed its mind about what it needs, this file would stop compiling rather than start misbehaving.
 *
 * **`isRecordingSupported` is separate from trying.** Asking whether a browser can record is a different question from whether the user will allow it, and a user interface needs to tell them apart: one is a
 * fact about the browser, the other is a decision the user has already made and can change.
 */
import type { RecordingStore } from "./recordingStore";
import { captureTake, type CaptureOptions, type CaptureOutcome } from "./captureTake";

/** Whether this browser can record at all — not whether it will be allowed to. */
export function isRecordingSupported(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function" && typeof MediaRecorder !== "undefined";
}

export async function captureWithBrowser(store: RecordingStore, options: CaptureOptions): Promise<CaptureOutcome> {
  // Checked rather than left to throw: an unsupported browser should reach the same named refusal as any other failure, so a caller has one shape to handle.
  if (!isRecordingSupported()) {
    return { ok: false, refusal: "unsupported", summary: "This browser cannot record audio, so recording is unavailable here." };
  }

  return captureTake(
    {
      requestStream: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
      /**
       * ⭐ An **adapter**, because the real handlers take DOM event types (`BlobEvent`, `Event`) while the capture only needs the one field it reads. Confining those casts to this file is what keeps
       * `captureTake` browser-free: the alternative is widening its interface to the DOM and losing the fake that its criteria depend on.
       */
      createRecorder: (stream) => {
        const recorder = new MediaRecorder(stream as MediaStream);
        return {
          start: () => recorder.start(),
          stop: () => recorder.stop(),
          get ondataavailable() {
            return recorder.ondataavailable as ((event: { data: { arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null;
          },
          set ondataavailable(handler: ((event: { data: { arrayBuffer(): Promise<ArrayBuffer> } }) => void) | null) {
            recorder.ondataavailable = handler as ((this: MediaRecorder, ev: BlobEvent) => unknown) | null;
          },
          get onstop() {
            return recorder.onstop as (() => void) | null;
          },
          set onstop(handler: (() => void) | null) {
            recorder.onstop = handler as ((this: MediaRecorder, ev: Event) => unknown) | null;
          },
          get onerror() {
            return recorder.onerror as ((event: { error?: unknown }) => void) | null;
          },
          set onerror(handler: ((event: { error?: unknown }) => void) | null) {
            recorder.onerror = handler as ((this: MediaRecorder, ev: Event) => unknown) | null;
          },
        };
      },
      // ⭐ Stopping every track is what turns the recording light off; `stop()` on the recorder alone does not.
      stopStream: (stream) => {
        for (const track of (stream as MediaStream).getTracks()) track.stop();
      },
      store,
    },
    options
  );
}
