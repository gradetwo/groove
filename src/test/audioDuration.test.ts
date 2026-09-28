import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { DurationError, audioDurationSeconds, longestDuration } from "../../scripts/lib/audio_duration.mjs";

/**
 * The duration method, with the tool injected — so the arithmetic is tested without needing `metaflac` on the machine, and the tool itself is checked once, separately.
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
      expect(() => audioDurationSeconds("x.flac", runner(bad)), `\"${bad}\" must be refused`).toThrow(DurationError);
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

  it("agrees with the real tool on a file that exists, when the tool is available", () => {
    // The one place the actual binary is used: if it is present, its answer must match what the arithmetic expects.
    const path = "/tmp/vd/Samples/kickmic/snare/kickmic_snare_center_vl29.flac";
    if (!existsSync(path)) return;
    let available = true;
    try {
      execFileSync("ffprobe", ["-version"], { stdio: "ignore" });
    } catch {
      available = false;
    }
    if (!available) return;
    const measured = audioDurationSeconds(path, { run: (command, args) => execFileSync(command, args, { encoding: "utf8" }) });
    // The tool reports seconds; sample rate and count are no longer part of this module's answer, because the tool it now uses does not need them.
    expect(measured.seconds).toBeCloseTo(1.934, 3);
    expect(measured.sampleRate).toBeNull();
  });
});
