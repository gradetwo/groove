/**
 * The two browser adapters the audio lane needs — small on purpose, because everything worth testing was moved behind the injection points.
 *
 * `decodeAudioData` needs a browser and bytes; the loader already handles single-flight and failure. An `AudioBufferSourceNode` needs a browser and starts exactly at
 * the second it is given, which is why this file has almost nothing in it: the scheduling arithmetic, the ordering and the failure reporting all live in
 * `audioLaneScheduler.ts`, where they can be tested.
 *
 * **What this file proves by existing**: it satisfies `SampleDecoder` and `SampleSink` exactly, so `tsc` is the criterion — the same instrument this workstream has
 * learned to distrust for behaviour and to trust for shape.
 */
import type { DecodedSample, SampleLoader } from "./sampleLoader";
import { createSampleLoader } from "./sampleLoader";
import type { SampleSink } from "./audioLaneScheduler";
import { samplerReleaseSeconds, startSamplerNote } from "./samplerVoice";
import { createLegatoVoiceLedger, type LegatoVoiceLedger } from "./legatoVoices";
import type { SampleAsset } from "../data/sampleCatalogue";
import { transportNote, type TransportProbe } from "./transportDiagnostic";
import { readWaveSustainLoop } from "./wavLoop";

/**
 * ⭐ **The bytes are read for their own loop before `decodeAudioData` takes them away.**
 *
 * `decodeAudioData` **detaches** the `ArrayBuffer` it is given, so the one moment at which this adapter can answer
 * *"does this recording carry a `smpl` loop?"* is between the fetch and the decode — and it costs nothing, because the
 * bytes are already here. That is the whole reason `DecodedSample` exists as a shape a decoder may return.
 *
 * Measured on the libraries the mirror serves: **136 of 136** `karoryfer-bigcat-cello` sustained recordings and
 * **224 of 224** `karoryfer-string-cyborgs` samples carry a `smpl` chunk, and their programs write no `loop_*` opcode
 * at all. The offline export path learned to read those chunks in the previous round (`src/audio/wavLoop.ts` +
 * `WavExporter`); this is the same fact reaching the **live** paths — the arrangement's sampler lanes
 * (`scheduleSamplerSteps`) and the audio-lane player (`audioLaneScheduler` → `browserSampleSink`).
 *
 * ⚠️ **Named rather than discovered — one measured side effect.** `vsco2ce` is not smpl-free either: **6 of its 1 830**
 * WAVs carry a whole-recording loop, `Keys/Upright Nr1/UR1_{C6,C7,G6,G7}_pp_RR{1,2}.wav`, named by `VSUpright1.sfz`,
 * which writes no loop opcode. Those six upright-piano takes will therefore now sustain in live playback. That is what
 * the SFZ specification asks for — `loop_mode`'s stated default is *"loop_continuous for samples with defined
 * loop(s)"* (<https://sfzformat.com/opcodes/loopmode/>) — and the offline half already behaves this way; it is a
 * consequence of the wiring, not an accident of it.
 */
/**
 * ⭐ **The return type is narrower than `SampleDecoder` on purpose.** A function that always answers with
 * {@link DecodedSample} still satisfies `SampleDecoder` (which allows either shape), but saying so precisely means a
 * caller that wants the loop does not have to cast for it — and the `tsc` criterion this file already leans on then
 * covers the loop's shape too.
 */
export function browserSampleDecoder(context: BaseAudioContext, probe?: TransportProbe): (asset: SampleAsset) => Promise<DecodedSample> {
  /**
   * **One address, and the loop its own bytes carry.** Kept in one place so both addresses answer identically: a
   * recording fetched from the mirror must loop exactly as the same recording fetched from the source host.
   */
  const decodeAddress = async (url: string): Promise<DecodedSample> => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    /**
     * `decodeAudioData` takes ownership of the ArrayBuffer it is given, which is why a fresh one is passed per call and
     * the loader caches the *result* — and why the `smpl` chunk is read **before** the decode rather than after.
     */
    const bytes = await response.arrayBuffer();
    const waveLoop = readWaveSustainLoop(new Uint8Array(bytes));
    const buffer = await context.decodeAudioData(bytes);
    return waveLoop ? { buffer, waveLoop } : { buffer };
  };
  return async (asset: SampleAsset): Promise<DecodedSample> => {
    if (!asset.url) {
      // The loud failure again: an asset declared without audio is an error, not a silent empty buffer.
      throw new Error(`sample "${asset.assetId}" has no url, so there are no bytes to decode`);
    }
    /**
     * ⭐ **Both addresses are tried, and both are named when both fail.**
     *
     * Muse, composing through the MCP server, reported that a sample whose primary URL 404s never tried its `fallbackUrl` — the fallback request count was zero. The instrument's **program** already did this (source first, mirror second, both named on failure), so the same library could load its SFZ from the mirror and then fail to load a single note from it: the addressing decision existed in one half of the loader and not in the other.
     */
    const reason = (error: unknown) => (error instanceof Error ? error.message : String(error));
    let primaryError: unknown;
    try {
      return await decodeAddress(asset.url);
    } catch (error) {
      primaryError = error;
    }
    if (!asset.fallbackUrl) {
      throw new Error(`sample "${asset.assetId}" could not be fetched from ${asset.url} (${reason(primaryError)})`);
    }
    try {
      return await decodeAddress(asset.fallbackUrl);
    } catch (fallbackError) {
      /**
       * The same explanation the SFZ path gives, for the same reason: the bytes half and the program half fail through one browser mechanism, so
       * a caller who has one of them explained would otherwise conclude the other had a different cause. `transportNote` asks the separating
       * question — does the address answer at all — and stays silent only when both modes failed, which the message already says.
       */
      const notes = [await transportNote(asset.url, probe), await transportNote(asset.fallbackUrl, probe)];
      throw new Error(
        `sample "${asset.assetId}": neither address served the bytes — source ${asset.url} (${reason(primaryError)})${notes[0] ?? ""}, ` +
          `mirror ${asset.fallbackUrl} (${reason(fallbackError)})${notes[1] ?? ""}`
      );
    }
  };
}

/**
 * ⭐ **The same decode, for bytes a caller already has** — the seam a persistent cache needs.
 *
 * `browserSampleDecoder` owns fetching *and* decoding, which is right for a caller with only an address and wrong for one that
 * has the bytes already (a disk cache, or a criterion). This is the decode half alone, and it is the same two steps in the
 * same order: read the `smpl` chunk **before** `decodeAudioData` detaches the buffer, then decode.
 *
 * `context` is the only thing it takes: a decode belongs to one `AudioContext`, and the bytes do not.
 */
export function browserBytesDecoder(context: BaseAudioContext): (asset: SampleAsset, bytes: ArrayBuffer) => Promise<DecodedSample> {
  return async (asset: SampleAsset, bytes: ArrayBuffer): Promise<DecodedSample> => {
    // The loop is read first, because `decodeAudioData` takes ownership of the buffer it is given.
    const waveLoop = readWaveSustainLoop(new Uint8Array(bytes));
    const buffer = await context.decodeAudioData(bytes);
    void asset;
    return waveLoop ? { buffer, waveLoop } : { buffer };
  };
}

/**
 * Starts a buffer source at the given second, through its own gain so a caller can place a sample quietly.
 *
 * ⭐ **The third parameter is the legato ledger, and it is the same one the offline sink uses.** `planAudioLaneEvents`
 * now marks an overlap the bow never stopped with `voiceRank` / `legato` (`src/audio/legatoJoin.ts`), so this sink does
 * what `createOfflineSamplerSink` does with those two fields: it asks `createLegatoVoiceLedger` to carry the voice that
 * is already sounding instead of starting this note's own recording. The ledger is a parameter rather than an internal
 * so a caller (a criterion, or a player that already holds one) can read what was carried and what was refused; the
 * default is one ledger per sink, which is one per playback.
 */
export function browserSampleSink(context: BaseAudioContext, destination: AudioNode, ledger?: LegatoVoiceLedger): SampleSink {
  const laneLedger = ledger ?? createLegatoVoiceLedger();
  return {
    start(buffer: AudioBuffer, whenSeconds: number, gainDb: number, event, note): void {
      /**
       * ⭐ **Two shapes, and the difference is whether the bytes are an instrument or a sample.**
       *
       * A plain sample (no `pitch`) is its own whole event, so the adapter starts it at its own rate for its own length —
       * exactly what it did before. An **instrument** event carries a note, the ratio the loader resolved and the lane's
       * `gate` in seconds, and it goes through `startSamplerNote` — the same voice the keyboard audition and the
       * arrangement player use — so a genre's live piano has the same attack and the same scheduled end as the
       * arrangement's and the renderer's.
       */
      if (typeof event.pitch === "number" && event.pitch > 0) {
        const ratio = note?.ratio ?? 1;
        const seconds = event.seconds;
        /**
         * ⭐ **A voice that will be handed on is started with a movable end, and only such a voice.**
         *
         * A voice started with `start(when, 0, seconds)` has its end **inside the node**, which a later `stop()` cannot
         * move (W3C: `duration` is "the duration of sound to be played", not a stop time) — so `takeOver()` refuses it
         * and the ledger would report `voice-cannot-be-extended` for a handover the rule allowed. The offline sink gives
         * every cut-short note a release ramp; this sink gives it to exactly the notes the rule names as `handedOn`,
         * under the offline sink's own measurement (`seconds < buffer.duration / ratio`, i.e. "this note is cut off
         * while the recording still had sound in it"). A note nobody will be handed keeps the scheduled length it has
         * today, byte for byte.
         */
        const recordingSeconds = buffer.duration / (Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
        const startVoice = () =>
          startSamplerNote({
            context,
            destination,
            buffer,
            ratio,
            whenSeconds,
            ...(seconds === undefined ? {} : { seconds }),
            /** ⭐ The same rule as the offline sink — the keyboard's notes were the ones being cut (see `samplerReleaseSeconds`). */
            ...(samplerReleaseSeconds(seconds, recordingSeconds) === undefined
              ? {}
              : { releaseSeconds: samplerReleaseSeconds(seconds, recordingSeconds)! }),
            /**
             * ⭐ **The region's loop declaration crosses here too.** A buffer does not say whether the region that named it
             * wanted the recording to repeat, so a `loop_sustain` program (`karoryfer-meatbass` writes it) would be cut at
             * the note's gate instead of holding — the same defect the offline sink had, on the other side of the seam.
             * Absent is SFZ's own default and this project's behaviour, so a plain sample is unchanged.
             */
            ...(note?.loopMode === undefined ? {} : { loopMode: note.loopMode }),
            ...(note?.loopStartFrames === undefined ? {} : { loopStartFrames: note.loopStartFrames }),
            ...(note?.loopEndFrames === undefined ? {} : { loopEndFrames: note.loopEndFrames }),
            ...(gainDb === 0 ? {} : { gainDb }),
            ...(event.pan === undefined ? {} : { pan: event.pan }),
          });
        /**
         * **The handover is the plan's, and the ledger decides whether the recording can reach it.** `event.legato` is
         * absent on a note the rule refused (a repeated pitch, a non-sustained technique, no voice to continue) and on a
         * lane the rule never examined, and the ledger starts a fresh attack for every such note — the behaviour this
         * sink had before, now with the one case the rule allows performed rather than requested.
         */
        laneLedger.play({
          trackIndex: event.trackIndex ?? 0,
          name: event.name,
          rank: event.voiceRank ?? 0,
          pitch: event.pitch,
          atSeconds: whenSeconds,
          ...(seconds === undefined ? {} : { seconds }),
          ratio,
          recordingSeconds: buffer.duration,
          ...(event.legato === undefined ? {} : { join: event.legato }),
          start: startVoice,
        });
        return;
      }
      const source = context.createBufferSource();
      source.buffer = buffer;
      const gain = context.createGain();
      gain.gain.value = Math.pow(10, gainDb / 20);
      source.connect(gain).connect(destination);
      // `when` is the whole contract of this adapter: the source begins exactly then, which is why the audio path is expected to add no latency of its own.
      source.start(whenSeconds);
    },
  };
}

/** The loader wired to a real context, for a caller that wants the whole path in one line. */
export function browserSampleLoader(
  context: BaseAudioContext,
  catalogue?: readonly SampleAsset[]
): SampleLoader {
  return createSampleLoader(browserSampleDecoder(context), catalogue);
}
