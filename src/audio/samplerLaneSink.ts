/**
 * ⭐ **The offline renderer's sampler-lane sink, as a thing that can be judged without a browser.**
 *
 * This is the bridge between "the lane planner decided *when* and *how long*" and "the voice decides *how it ends*".
 * It was written inline in `WavExporter` and every rule it carries was found the hard way — a note with no end droning
 * until the render stopped, `loop_mode` reaching the resolver and dying at the call site, a note cut mid-cycle heard
 * as the sustained bed breaking — so it is a seam worth having in one place with its own criteria rather than a dozen
 * lines buried in a 2 400-line renderer.
 *
 * What it does, in the order the three defects were found:
 *
 *   · **Every voice is given an end.** `event.seconds` is the lane's own `gate` in seconds; for a plain-sample lane
 *     the bytes are the whole event, so the buffer's own length is the end. A voice started with neither rang until
 *     the render stopped, and every retrigger piled another endless voice onto the mix.
 *   · **The region's loop declaration crosses here.** A buffer does not say whether the region asked for the
 *     recording to repeat; `note` does, and it is absent for a plain sample, which has no SFZ.
 *   · **A note the recording outlasts is given an end, not a cut.** `start(when, 0, seconds)` ends playback at that
 *     instant and truncates the waveform mid-cycle, which is a step, and a step is a click. The condition is the
 *     measurement rather than a taste: `recordingSeconds = buffer.duration / ratio` is how long the sample lasts at
 *     the rate this note plays it, so `seconds < recordingSeconds` is exactly "this voice is cut off while the
 *     recording still had sound in it". A percussive hit whose bytes end before the written gate is left alone — its
 *     own decay is its ending — and a looping voice is scheduled by `samplerVoice`'s own branch order, not here.
 *   · ⭐ **A legato handover is performed by the ledger.** `event.legato` is the overlap rule's decision that this
 *     note must not start its own attack, and `event.voiceRank` says which line of the chord it is. The ledger
 *     (`src/audio/legatoVoices.ts`) carries the sounding voice when it can and refuses when it cannot — the one
 *     refusal needs the decoded recording's length, which only exists on this side of the seam.
 */
import { DEFAULT_SAMPLER_RELEASE_SECONDS, startSamplerNote } from "./samplerVoice";
import { createLegatoVoiceLedger, type LegatoVoiceLedger, type LegatoVoiceReading } from "./legatoVoices";
import type { OfflineAudioLaneEvent, OfflineAudioLaneSink } from "./offlineAudioLanes";

export interface OfflineSamplerSinkInput {
  context: BaseAudioContext;
  /** Where the lane's voices go — the renderer's music bus, so a lane goes through the master graph like every other track. */
  destination: AudioNode;
  /** The ledger to use, when the caller already has one; one is created when it does not. */
  ledger?: LegatoVoiceLedger;
}

/** The sink, with its ledger's reading attached so the caller can report what became of the plan's handovers. */
export interface OfflineSamplerSink extends OfflineAudioLaneSink {
  legatoReading(): LegatoVoiceReading;
}

export function createOfflineSamplerSink(input: OfflineSamplerSinkInput): OfflineSamplerSink {
  const { context: ctx, destination } = input;
  const laneLedger = input.ledger ?? createLegatoVoiceLedger();
  return {
    start(buffer: AudioBuffer, event: OfflineAudioLaneEvent, ratio: number, note): void {
      const seconds = event.seconds ?? buffer.duration;
      const recordingSeconds = buffer.duration / (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
      const startVoice = () =>
        startSamplerNote({
          context: ctx,
          destination,
          buffer,
          ratio,
          whenSeconds: Math.max(0, event.atSeconds),
          seconds,
          ...(seconds < recordingSeconds ? { releaseSeconds: DEFAULT_SAMPLER_RELEASE_SECONDS } : {}),
          ...(note?.loopMode === undefined ? {} : { loopMode: note.loopMode }),
          ...(note?.loopStartFrames === undefined ? {} : { loopStartFrames: note.loopStartFrames }),
          ...(note?.loopEndFrames === undefined ? {} : { loopEndFrames: note.loopEndFrames }),
          ...(event.gainDb === 0 ? {} : { gainDb: event.gainDb }),
          ...(event.pan === undefined ? {} : { pan: event.pan }),
        });
      /**
       * **A plain sample is not a note, so it never goes through the ledger.** Its bytes are the whole event and there
       * is no pitch to move; keeping it out means the ledger's registry only ever holds notes, and a "voice" it carries
       * is always a note's voice.
       */
      if (event.pitch === undefined) {
        startVoice();
        return;
      }
      laneLedger.play({
        trackIndex: event.trackIndex,
        name: event.name,
        rank: event.voiceRank ?? 0,
        pitch: event.pitch,
        atSeconds: Math.max(0, event.atSeconds),
        ...(event.seconds === undefined ? {} : { seconds: event.seconds }),
        ratio,
        recordingSeconds: buffer.duration,
        ...(event.legato === undefined ? {} : { join: event.legato }),
        start: startVoice,
      });
    },
    legatoReading: () => laneLedger.reading(),
  };
}
