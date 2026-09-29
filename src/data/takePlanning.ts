/**
 * Turning a finished capture into a take — the rules, kept out of the browser so they can be checked.
 *
 * Recording itself is a browser affair (`getUserMedia` needs a user gesture and a permission), and the OPFS store already keeps its browser call at the edge. The same applies here: what a capture *becomes* is
 * decided by a pure function, so the answers to "what does a take look like", "does it get a region", and "what does a user see when permission is refused" are all testable without a microphone.
 *
 * **A recording is not a track kind** (the owner's correction), so nothing here mentions the track's kind: it takes `source` — audio or MIDI — and the same function serves an instrument track recording a
 * performance and an audio track recording sound.
 */
import type { Take, TakeRegion } from "../types/arrangementV2";

export interface CaptureResult {
  /** The recorded bytes — for a MIDI take, an encoded sequence; for audio, the encoded sound. */
  bytes: ArrayBuffer;
  source: Take["source"];
  /** When it finished, in epoch milliseconds: the ordering a take list uses. */
  recordedAt: number;
  /** The bar range it covers, when the transport was rolling. A capture with no range is a take with no region, which is a real state rather than an error. */
  startBar?: number;
  endBar?: number;
  label?: string;
}

export interface PlannedTake {
  take: Take;
  /** Present only when the capture covered a range — the "this section was recorded" case from the owner's description. */
  region?: TakeRegion;
}

let nextTake = 1;

/** Test seam: ids only need to be unique within an arrangement, and a deterministic first id keeps criteria readable. */
export function resetTakeIdsForTests(): void {
  nextTake = 1;
}

export function planTakeFromCapture(capture: CaptureResult, idOverride?: string): PlannedTake {
  // Generated rather than derived from the bytes: two identical recordings are two takes, and a content hash would merge them — the same rule the stores follow.
  const take: Take = {
    id: idOverride ?? `take-${nextTake++}`,
    recordedAt: capture.recordedAt,
    source: capture.source,
    ...(capture.label ? { label: capture.label } : {}),
  };

  // A region needs a range that can be played: an end at or before the start would make a region nothing falls into, which would look like a take that never plays.
  const hasRange = typeof capture.startBar === "number" && typeof capture.endBar === "number" && capture.endBar > capture.startBar;
  return hasRange ? { take, region: { startBar: capture.startBar!, endBar: capture.endBar!, takeId: take.id } } : { take };
}

/** Why a capture could not start, in the user's terms — the same shape as the catalogue's status, and for the same reason: the causes look identical from outside. */
/**
 * ⭐ `unsupported` means **the browser cannot record** and is decided by capability, never inferred from an exception; `unavailable` is the distinct case the probe found — every API present and the browser
 * still refusing to produce a stream. Collapsing the two told a user with a working microphone that their browser could not record, which is a lie the capability check had already ruled out.
 */
export type CaptureRefusal = "permission-denied" | "no-device" | "unsupported" | "unavailable" | "failed";

export function classifyCaptureRefusal(error: unknown): { refusal: CaptureRefusal; summary: string } {
  const name = error instanceof Error ? error.name : "";
  // `NotAllowedError` is what a refused permission looks like; naming it separately matters because it is the one a user can fix by themselves.
  if (name === "NotAllowedError" || name === "SecurityError") {
    return { refusal: "permission-denied", summary: "Microphone permission was refused, so nothing was recorded. Grant it for this site and try again." };
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return { refusal: "no-device", summary: "No recording device was found. Connect a microphone or interface and try again." };
  }
  if (name === "NotSupportedError") {
    // ⭐ Read from the browser rather than inferred: `getUserMedia` exists and refuses anyway, which says nothing about whether the *browser* can record.
    return { refusal: "unavailable", summary: "The browser would not provide a recording stream — a device may be missing, busy, or blocked by a policy on this machine." };
  }
  // ⚠️ `TypeError` is deliberately **not** mapped to a capability claim: it also covers being called wrongly, and an over-broad mapping here is what produced the wrong sentence in the first place.
  return { refusal: "failed", summary: "Recording failed to start." };
}
