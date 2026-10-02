import { describe, expect, it } from "vitest";
import { DurationError, audioDurationSeconds, longestDuration } from "../../scripts/lib/audio_duration.mjs";

/**
 * The duration method, with the tool injected — so the arithmetic is tested without needing `metaflac` on the machine. **The tool itself is deliberately not checked here**: the comparison that used to do it read a sample under `/tmp/vd`, a private path that exists on no machine the suite runs on, so it asserted nothing anywhere and was counted as a pass. It was deleted rather than vendored, because the four cases below already hold the arithmetic against figures that came from the real tool, which is the property the injected runner exists to protect. `docs/OPEN_WORK.md` §十七之五 records the measurement and this decision.
 *
 * Every figure below comes from the real files: `metaflac` was asked, and `ffprobe` agreed with it. The point of the injected runner is that a wrong division cannot hide
 * behind a correct tool.
 */
const runner = (seconds: string) => ({
  run: (command: string, args: string[]) => {
    if (command !== "ffprobe") throw new Error(`unexpected command ${command}`);
    return seconds;
  },
});

describe("audioDurationSeconds", () => {
  it("reads the duration the tool reports, for the two real files and a WAV", () => {
    // The figures `ffprobe` gave, which agreed with `metaflac` on the FLAC file and are the only tool that also reads the library's WAV samples.
    expect(audioDurationSeconds("snare.flac", runner("1.934000\n")).seconds).toBeCloseTo(1.934, 4);
    expect(audioDurationSeconds("kick.flac", runner("3.085700\n")).seconds).toBeCloseTo(3.0857, 4);
    // **A WAV is the case the whole library run turned on**: `metaflac` failed on `Agogo_High_v1_rr1_Close.wav`, and `ffprobe` answers for both.
    expect(audioDurationSeconds("agogo.wav", runner("0.410000")).seconds).toBeCloseTo(0.41, 4);
  });

  it("refuses a duration that is not positive, whether it arrives as zero, NaN or nonsense", () => {
    // The invented value this mechanism exists to avoid: zero would be a duration nobody measured.
    for (const bad of ["0", "0.0", "N/A", "-1"]) {
      expect(() => audioDurationSeconds("x.flac", runner(bad)), `"${bad}" must be refused`).toThrow(DurationError);
    }
    expect(() => audioDurationSeconds("x.flac", runner("0"))).toThrow(/duration of 0/);
  });

  it("reports a tool that could not run, rather than a duration of zero", () => {
    const failing = {
      run: () => {
        throw new Error("ffprobe: command not found");
      },
    };
    expect(() => audioDurationSeconds("x.flac", failing)).toThrow(/could not read x\.flac/);
  });

  it("takes the longest of several samples, which is what a catalogue entry states", () => {
    const perPath = (path: string) => (path.includes("long") ? runner("3.085700") : runner("1.934000"));
    const longest = longestDuration(["a.flac", "long.flac", "b.flac"], { run: (c: string, a: string[]) => perPath(a[a.length - 1]!).run(c, a) });
    expect(longest!.path).toBe("long.flac");
    expect(longest!.seconds).toBeCloseTo(3.0857, 4);
    expect(longestDuration([], runner("1"))).toBeNull();
  });
});
