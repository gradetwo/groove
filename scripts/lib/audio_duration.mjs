/**
 * How long a sample is — asked of a tool that already knows, rather than parsed out of the file by hand.
 *
 * **This is the third method tried, and the first two were wrong.** Rendering the sample through sfizz returns the *note's* length, not the sample's (30.0002 s for a 1.93 s
 * file). Parsing FLAC's `STREAMINFO` myself took three guesses at the bit layout and produced `6266812 s` from a file that is 1.93 s long. `metaflac` was in `/usr/bin` the
 * whole time, and `ffprobe` agrees with it.
 *
 * So the rule this encodes is: **before parsing a binary format by hand, ask whether the machine already has a tool a million files have exercised.** The runner is injected
 * for the same reason every other I/O in this project is — so the arithmetic can be tested without the tool.
 */
export class DurationError extends Error {}

/**
 * @param {string} path
 * @param {{ run: (command: string, args: string[]) => string }} options — `run` must return stdout, and throw on failure.
 * @returns {{ seconds: number, sampleRate: number, samples: number }}
 */
export function audioDurationSeconds(path, { run }) {
  let samples;
  let rate;
  try {
    samples = Number(run("metaflac", ["--show-total-samples", path]).trim());
    rate = Number(run("metaflac", ["--show-sample-rate", path]).trim());
  } catch (error) {
    // A tool that could not run is reported with its reason rather than becoming a duration of zero.
    throw new DurationError(`could not read ${path}: ${error && error.message ? error.message : String(error)}`);
  }

  if (!Number.isFinite(samples) || samples <= 0) throw new DurationError(`${path}: metaflac reported ${samples} samples`);
  if (!Number.isFinite(rate) || rate <= 0) {
    // A zero rate would divide into Infinity, which is the kind of number that silently becomes a plausible duration somewhere else.
    throw new DurationError(`${path}: metaflac reported a sample rate of ${rate}`);
  }

  return { seconds: samples / rate, sampleRate: rate, samples };
}

/** The longest sample an instrument uses, which is the duration a catalogue entry wants to state. */
export function longestDuration(paths, options) {
  const measured = paths.map((path) => ({ path, ...audioDurationSeconds(path, options) }));
  if (measured.length === 0) return null;
  return measured.reduce((longest, entry) => (entry.seconds > longest.seconds ? entry : longest));
}
