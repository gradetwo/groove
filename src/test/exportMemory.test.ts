import { describe, it, expect } from "vitest";
import { EXPORT_MEMORY_WARN_BYTES, estimateExportMemoryBytes } from "../audio/WavExporter";

/**
 * The estimate exists because of a crash report: exporting stems in Safari restarted the page.
 *
 * WebKit does not throw when it runs out of memory, it kills the tab, so the only defence is to know the size before
 * starting and say so. These cases pin the arithmetic (which is what the warning is built on) and the threshold's
 * order of magnitude, because a threshold that never fires is the same as no warning.
 */
describe("export memory estimate", () => {
  it("adds one live buffer to every encoded stem", () => {
    const estimate = estimateExportMemoryBytes({ seconds: 60, sampleRate: 44100, tracks: 8, stems: true });
    // 60 s × 44100 × 2ch × 4 bytes = 21.2 MB live buffer; ×2 bytes = 10.6 MB per encoded stem.
    expect(estimate.buffers).toBe(60 * 44100 * 2 * 4);
    expect(estimate.encoded).toBe(8 * 60 * 44100 * 2 * 2);
    expect(estimate.peak).toBe(estimate.buffers + estimate.encoded);
  });

  it("counts a single file for a master export", () => {
    const master = estimateExportMemoryBytes({ seconds: 60, sampleRate: 44100, tracks: 8, stems: false });
    const stems = estimateExportMemoryBytes({ seconds: 60, sampleRate: 44100, tracks: 8, stems: true });
    expect(master.encoded).toBe(60 * 44100 * 2 * 2);
    // Eight encoded stems instead of one, on top of the same single live buffer: a bit over three times the peak.
    expect(stems.peak).toBeGreaterThan(master.peak * 3);
  });

  it("crosses the warning threshold for a long stems export, and not for a short one", () => {
    const long = estimateExportMemoryBytes({ seconds: 240, sampleRate: 44100, tracks: 8, stems: true });
    const short = estimateExportMemoryBytes({ seconds: 30, sampleRate: 44100, tracks: 8, stems: true });
    expect(long.peak).toBeGreaterThan(EXPORT_MEMORY_WARN_BYTES);
    expect(short.peak).toBeLessThan(EXPORT_MEMORY_WARN_BYTES);
    // The number a person is shown is in megabytes, and it has to be the same order as the bytes it describes.
    expect(long.megabytes).toBeGreaterThan(250);
  });
});
