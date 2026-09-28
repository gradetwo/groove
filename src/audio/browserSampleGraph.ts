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
import type { SampleDecoder, SampleLoader } from "./sampleLoader";
import { createSampleLoader } from "./sampleLoader";
import type { SampleSink } from "./audioLaneScheduler";
import type { SampleAsset } from "../data/sampleCatalogue";

/** Fetches an asset's bytes and decodes them, refusing an asset that has no bytes to fetch. */
export function browserSampleDecoder(context: BaseAudioContext): SampleDecoder {
  return async (asset: SampleAsset): Promise<AudioBuffer> => {
    if (!asset.url) {
      // The loud failure again: an asset declared without audio is an error, not a silent empty buffer.
      throw new Error(`sample "${asset.assetId}" has no url, so there are no bytes to decode`);
    }
    const response = await fetch(asset.url);
    if (!response.ok) throw new Error(`sample "${asset.assetId}" could not be fetched (${response.status})`);
    // `decodeAudioData` takes ownership of the ArrayBuffer it is given, which is why a fresh one is passed per call and the loader caches the *result*.
    return context.decodeAudioData(await response.arrayBuffer());
  };
}

/** Starts a buffer source at the given second, through its own gain so a caller can place a sample quietly. */
export function browserSampleSink(context: BaseAudioContext, destination: AudioNode): SampleSink {
  return {
    start(buffer: AudioBuffer, whenSeconds: number, gainDb: number): void {
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
