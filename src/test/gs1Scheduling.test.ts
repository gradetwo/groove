/**
 * GS-1 scheduling feasibility (P6 / requirement 11) — the reason Phase 2 is not wired yet.
 *
 * ## The finding
 *
 * Groove Lab schedules sample-accurately: `AudioEngine` enqueues every note with an exact
 * `AudioContext` time and a **200 ms lookahead** (`scheduleAheadSec`, `AudioEngine.ts:201`).
 * The vendored GS-1 worklet, however, has **no way to be told when a note should sound**:
 * every inbound message acts the moment it is delivered (`noteOn`, `noteOnPan`, `noteOff`, ...,
 * read out of the processor's own `handleMessage` switch), and none carries a time or frame
 * field. A `noteOn` posted at scheduling time therefore fires up to 200 ms early; posted at the
 * last moment it fires late by the message latency plus main-thread timer jitter.
 *
 * Upstream's own offline renderer is the proof that exact timing exists only *offline*: it uses
 * `OfflineAudioContext.suspend(t)` and posts the note inside the suspension (sibling repository,
 * `src/audio/render.ts:145`). `suspend` has no live counterpart, so a GS-1-voiced `chords` or
 * `lead` track would necessarily play at a different time in playback than in the exported WAV —
 * which is exactly what this repository's **hard exporter-parity rule** forbids.
 *
 * ## What this file does about it
 *
 * **Resolved upstream.** The proposal in `AUDIO_QUALITY_AND_SYNTH_PLAN.md` §5.9 was implemented in
 * GS-1 v2.1.5 (`e073df5`): `noteAt` / `noteOffAt` carry an absolute frame, the processor queues
 * them, and it splits the render block at each due event. The checks below therefore flipped from
 * "the protocol must not be used" to "the protocol must have the timed pair", which is the
 * self-clearing behaviour this file was written for.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const REPO_ROOT = path.resolve(SRC_DIR, "..");
const WORKLET = path.join(REPO_ROOT, "vendor", "gs1", "src", "audio", "worklet-processor.js");

/** Message types that would let a host place a note at a render time. */
const TIMED_MESSAGE_TYPES = ["noteAt", "noteOnAt", "noteOffAt", "scheduleNote", "eventsAt"];

/** The engines that would have to agree on timing for export parity to hold. */
const ENGINE_FILES = ["audio/AudioEngine.ts", "audio/WavExporter.ts"];

const read = (relative: string) => readFileSync(path.join(SRC_DIR, relative), "utf8");

/** Every `case '<type>':` label in the processor's inbound message switch. */
function inboundMessageTypes(): string[] {
  const source = readFileSync(WORKLET, "utf8");
  const start = source.indexOf("handleMessage(data)");
  const end = source.indexOf("return true;", start);
  const body = source.slice(start, end > start ? end : undefined);
  return [...body.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]);
}

describe("GS-1 scheduling feasibility (P6)", () => {
  it("reads the vendored worklet's inbound message protocol", () => {
    const types = inboundMessageTypes();
    expect(types.length, "no inbound message types parsed — the parser or the worklet changed").toBeGreaterThan(8);
    expect(types).toContain("noteOn");
    expect(types).toContain("noteOff");
  });

  it("carries a frame-addressed note pair — the precondition for wiring is met", () => {
    /**
     * This assertion used to be the opposite: it pinned the *absence* of any time field, because
     * that absence was what made wiring impossible. Upstream resolved it in GS-1 v2.1.5
     * (`e073df5`): the processor now accepts `noteAt` / `noteOffAt` carrying an absolute frame,
     * queues them, and splits the render block at each due event. Measured there: the voice
     * starts at exactly `atFrame + 128` for every `atFrame`, so the in-block position is
     * preserved and the offset is a constant a host can compensate.
     */
    const types = inboundMessageTypes();
    expect(types).toContain("noteAt");
    expect(types).toContain("noteOffAt");
    const source = readFileSync(WORKLET, "utf8");
    const start = source.indexOf("handleMessage(data)");
    const body = source.slice(start, source.indexOf("return true;", start));
    expect(body).toContain("data.atFrame");
    // The constant latency is reported rather than left for the host to hard-code.
    expect(source).toContain("scheduledNoteLatencyFrames");
    expect(source).toContain("SCHEDULED_NOTE_LATENCY_FRAMES");
  });

  it("measures the lookahead the live scheduler relies on", () => {
    const source = read("audio/AudioEngine.ts");
    const match = source.match(/scheduleAheadSec[^=]*=\s*([\d.]+)/);
    expect(match, "could not read scheduleAheadSec").toBeTruthy();
    const seconds = Number(match![1]);
    // Quoted so the finding stays tied to a number: a note posted at scheduling time would be
    // this far early.
    expect(seconds).toBeGreaterThanOrEqual(0.1);
    expect(source).toContain("sample-accurate");
  });

  it("keeps the engines off the GS-1 host while the protocol cannot schedule (self-clearing guard)", () => {
    const types = inboundMessageTypes();
    const timed = types.filter((t) => TIMED_MESSAGE_TYPES.includes(t));
    const importers = ENGINE_FILES.filter(
      (file) => read(file).includes("gs1/Gs1Host") || read(file).includes("gs1/Gs1Instrument")
    );

    if (timed.length === 0) {
      expect(
        importers,
        "the GS-1 worklet cannot place a note at a render time, so routing chords/lead through " +
          "it would break sample-accurate playback and the live/export parity rule. " +
          "See AUDIO_QUALITY_AND_SYNTH_PLAN.md §5.9 for the upstream protocol proposal."
      ).toEqual([]);
    } else {
      // Upstream added a timed note message: the guard has cleared itself, and the wiring is now
      // the expected next step rather than a violation.
      expect(timed.length).toBeGreaterThan(0);
    }
  });

  it("keeps the onset probe that E7 depends on", () => {
    // The E7 measurement is only meaningful because onset is timestamped on the audio rendering
    // thread; a main-thread poll quantises to ~16 ms, which is the size of the effect measured.
    const probe = path.join(REPO_ROOT, "public", "gs1OnsetProbe.js");
    const source = readFileSync(probe, "utf8");
    expect(source).toContain('registerProcessor("gs1-onset-probe"');
    expect(source).toContain("currentFrame");
  });

  it("records why the exporter in particular cannot absorb the difference", () => {
    const exporter = read("audio/WavExporter.ts");
    // The parity rule is stated in the exporter itself; if that claim is ever removed, this
    // guard's rationale needs rewriting rather than silently outliving its reason.
    expect(exporter).toMatch(/parity|identical|same/i);
  });
});
