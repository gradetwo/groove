/**
 * How long a sample is — asked of a tool that already knows, rather than parsed out of the file by hand.
 *
 * **This is the fourth method tried, and three were wrong.** Rendering the sample through sfizz returns the *note's* length, not the sample's (30.0002 s for a 1.93 s file).
 * Parsing FLAC's `STREAMINFO` myself took three guesses at the bit layout and produced `6266812 s` from a file that is 1.93 s. `metaflac` worked — and then the mirror fetched a
 * whole library and died on a **`.wav`**, because `metaflac` reads FLAC only. `ffprobe` reads both, and it is the tool that was already cross-checking `metaflac`, so it is not
 * a new claim about the same file.
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
  let seconds;
  try {
    /**
     * **`ffprobe`, not `metaflac` — and the mirror run is why.**
     *
     * `metaflac` was the tool that worked first, on the two FLAC samples the chain was tested with. Then the mirror fetched a whole library and died on
     * `Agogo_High_v1_rr1_Close.wav`: **`metaflac` reads FLAC only**, and this library ships WAV as well. `ffprobe` reads both — and it is the tool that was already
     * acting as the cross-check, agreeing with `metaflac` on the FLAC file, so its answer is not a new claim.
     */
    seconds = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", path]).trim());
  } catch (error) {
    // A tool that could not run is reported with its reason rather than becoming a duration of zero.
    throw new DurationError(`could not read ${path}: ${error && error.message ? error.message : String(error)}`);
  }

  if (!Number.isFinite(seconds) || seconds <= 0) {
    // A non-positive duration is the invented value this whole mechanism exists to avoid, whether it arrives as zero, NaN or a negative.
    throw new DurationError(`${path}: ffprobe reported a duration of ${JSON.stringify(seconds)}`);
  }

  return { seconds, sampleRate: null, samples: null };
}

/** The longest sample an instrument uses, which is the duration a catalogue entry wants to state. */
export function longestDuration(paths, options) {
  const measured = paths.map((path) => ({ path, ...audioDurationSeconds(path, options) }));
  if (measured.length === 0) return null;
  return measured.reduce((longest, entry) => (entry.seconds > longest.seconds ? entry : longest));
}
