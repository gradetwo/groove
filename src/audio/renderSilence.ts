/**
 * Did a render produce any sound at all?
 *
 * ## Why this is its own question
 *
 * A render can come back with the **correct frame count and no samples in it**. Measured on the Node
 * Web Audio host (`node-web-audio-api@2.2.0`) by `scripts/probe_render_repeats.ts`: a whole buffer of
 * digital silence, `limiter = "worklet"`, every spectral band on the −120 dB floor. The host's own
 * lifecycle can fail this way, and every consumer downstream — a file, a loudness number, an agent's
 * reply — has no way to tell that apart from a quiet passage unless somebody looks at the samples.
 *
 * The probe refuses to *score* a silent render (that gate stays); this module is the same question
 * asked one level up, where the answer can reach the person who asked for the file.
 *
 * ## What counts as silence
 *
 * Total silence, not "quiet". The test is whether any channel holds a sample above
 * `SILENT_RENDER_PEAK_THRESHOLD`, which is −120 dBFS — the floor this project's own 13-band
 * fingerprint uses for a silent render, and far below anything an intentional fade or a very quiet
 * tail reaches. A partial render, a dim render or a silent *track* is not this: only a buffer that
 * holds no signal anywhere is a failed render rather than a measurement.
 *
 * The peak is read from the samples rather than from a reported metric on purpose. `-Infinity`
 * loudness and `-Infinity` true peak are already computed on this path, and both are *reports*; the
 * samples are the thing that either exists or does not.
 */

/** Peak amplitude that counts as sound. −120 dBFS, the floor the timbre fingerprint reports for silence. */
export const SILENT_RENDER_PEAK_THRESHOLD = 1e-6;

/** The channel-data surface this test needs: an `AudioBuffer` has it, and so does a test double. */
export interface ChannelDataBuffer {
  readonly numberOfChannels: number;
  /** Frame count. Only used to make the failure message say what *did* come back. */
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

/** Largest absolute sample in the buffer, or 0 when it has no channels. */
export function bufferPeak(buffer: ChannelDataBuffer): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      const value = Math.abs(data[i]!);
      if (value > peak) peak = value;
    }
  }
  return peak;
}

/**
 * True when the buffer holds any signal at all.
 *
 * A buffer with zero channels is silent: there is nothing to hear and nothing to write.
 */
export function bufferHasAudio(
  buffer: ChannelDataBuffer,
  threshold: number = SILENT_RENDER_PEAK_THRESHOLD
): boolean {
  if (buffer.numberOfChannels <= 0) return false;
  return bufferPeak(buffer) > threshold;
}
