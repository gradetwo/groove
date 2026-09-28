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
const runner = (samples: string, rate: string) => ({
  run: (command: string, args: string[]) => {
    if (command !== "metaflac") throw new Error(`unexpected command ${command}`);
    return args[0] === "--show-total-samples" ? samples : rate;
  },
});

describe("audioDurationSeconds", () => {
  it("divides samples by rate, matching the two tools that agreed on the real files", () => {
    // The snare sample: 48000 Hz, 92832 samples — metaflac said 1.9340 s and ffprobe said 1.934000.
    const snare = audioDurationSeconds("snare.flac", runner("92832", "48000"));
    expect(snare.seconds).toBeCloseTo(1.934, 4);
    // The kick sample: 148113 samples at the same rate.
    expect(audioDurationSeconds("kick.flac", runner("148113", "48000")).seconds).toBeCloseTo(3.0857, 4);
  });

  it("refuses a zero sample rate rather than returning Infinity", () => {
    // Infinity is the number that becomes a plausible-looking duration somewhere else, which is exactly what must not happen.
    expect(() => audioDurationSeconds("x.flac", runner("1000", "0"))).toThrow(DurationError);
    expect(() => audioDurationSeconds("x.flac", runner("1000", "0"))).toThrow(/sample rate of 0/);
  });

  it("reports a tool that could not run, rather than a duration of zero", () => {
    const failing = {
      run: () => {
        throw new Error("metaflac: command not found");
      },
    };
    expect(() => audioDurationSeconds("x.flac", failing)).toThrow(/could not read x\.flac/);
    expect(() => audioDurationSeconds("x.flac", runner("0", "48000"))).toThrow(/0 samples/);
  });

  it("takes the longest of several samples, which is what a catalogue entry states", () => {
    const perPath = (path: string) => (path.includes("long") ? runner("148113", "48000") : runner("92832", "48000"));
    const longest = longestDuration(["a.flac", "long.flac", "b.flac"], { run: (c: string, a: string[]) => perPath(a[a.length - 1]!).run(c, a) });
    expect(longest!.path).toBe("long.flac");
    expect(longest!.seconds).toBeCloseTo(3.0857, 4);
    expect(longestDuration([], runner("1", "48000"))).toBeNull();
  });

  it("agrees with the real tool on a file that exists, when the tool is available", () => {
    // The one place the actual binary is used: if it is present, its answer must match what the arithmetic expects.
    const path = "/tmp/vd/Samples/kickmic/snare/kickmic_snare_center_vl29.flac";
    if (!existsSync(path)) return;
    let available = true;
    try {
      execFileSync("metaflac", ["--version"], { stdio: "ignore" });
    } catch {
      available = false;
    }
    if (!available) return;
    const measured = audioDurationSeconds(path, { run: (command, args) => execFileSync(command, args, { encoding: "utf8" }) });
    expect(measured.samples).toBe(92832);
    expect(measured.sampleRate).toBe(48000);
    expect(measured.seconds).toBeCloseTo(1.934, 3);
  });
});
