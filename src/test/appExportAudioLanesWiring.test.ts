/**
 * **The hook's half of the audio-lane wiring** — the part the renderer cannot prove.
 *
 * `appExportAudioLanes.test.ts` drives the exporter with the exact options `useExportActions` builds. This file pins that the hook *builds* them: every audio export (WAV, MP3, stems) loads
 * the app's one catalogue runtime and passes `audioLaneCatalogue` with an `onAudioLanes` reporter through to the exporter, and the reporter's rendered/skipped lists reach the toast.
 *
 * `WavExporter`, `Mp3Exporter` and the catalogue runtime are mocked so the assertions are about the arguments and the user-visible message rather than about a render — the render is measured
 * for real in the sibling file. Each mocked export calls `onAudioLanes` exactly as the production one does, including the per-stem call sequence, so "the reporter is wired" is tested rather
 * than assumed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useExportActions } from "../features/sequencer/hooks/useExportActions";
import type { SequencerPattern } from "../types/genre";
import type { SampleAsset } from "../data/sampleCatalogue";

const mocks = vi.hoisted(() => ({
  exportMasterWav: vi.fn(),
  exportMasterMp3: vi.fn(),
  exportStemsZip: vi.fn(),
  triggerWavDownload: vi.fn(),
  load: vi.fn(),
}));

vi.mock("../audio/WavExporter", () => ({
  EXPORT_MEMORY_WARN_BYTES: 220 * 1024 * 1024,
  estimateExportMemoryBytes: () => ({ buffers: 0, encoded: 0, peak: 0, megabytes: 0 }),
  exportMasterWav: mocks.exportMasterWav,
  exportStemsZip: mocks.exportStemsZip,
  renderPatternOffline: vi.fn(),
  triggerWavDownload: mocks.triggerWavDownload,
}));

vi.mock("../audio/Mp3Exporter", () => ({ exportMasterMp3: mocks.exportMasterMp3 }));

vi.mock("../data/sampleCatalogueRuntime", () => ({ appCatalogueRuntime: { load: mocks.load } }));

const probeAsset: SampleAsset = {
  assetId: "probe-impulse",
  name: "Probe impulse",
  kind: "one-shot",
  seconds: 0.01,
  url: "https://example.test/probe.wav",
};

/** A pattern carrying the lane exactly as the arrange/compile path leaves it. */
const audioPattern: SequencerPattern = {
  genre_id: "custom",
  bpm: 120,
  scale: "minorPentatonic",
  tracks: [{ track_id: "audio", name: "Drums", instrument: "sampler", steps: [1, 0, 0, 0], sample: { assetId: "probe-impulse" } }],
};

const synthPattern: SequencerPattern = {
  ...audioPattern,
  // A lane that stays on the synthesised side, so `hasAudioLane` is false and the manifest fetch really is
  // skipped. A bare role word no longer qualifies: the drum table maps it, so naming a synth lane "kick"
  // made this fixture carry a recorded lane without meaning to.
  tracks: [{ track_id: "chords", name: "Warm Pad", instrument: "warm_pad", steps: [1, 0, 0, 0] }],
};

const exportResult = { blob: new Blob(["x"]), filename: "custom_master_120bpm.wav", durationSec: 1, limiterKind: "worklet", gs1HostFailures: 0 };

function mount(pattern: SequencerPattern) {
  const showToast = vi.fn();
  const seqState = {
    songMode: false,
    activeSlot: "A",
    patterns: { A: pattern, B: pattern },
    sections: [],
    loopRange: undefined,
    isMetronome: false,
    isCountIn: false,
  };
  const { result } = renderHook(() =>
    useExportActions({
      patternRef: { current: pattern } as never,
      seqStateRef: { current: seqState } as never,
      bpm: 120,
      swing: 0,
      timeSignature: "4/4",
      resolution: "1/16",
      stepCount: 16,
      currentGenre: { id: "custom", name: "Custom" } as never,
      activeProject: null,
      effectsRackState: {} as never,
      drumKit: "808",
      isZh: false,
      showToast,
    })
  );
  return { result, showToast };
}

describe("the export actions and the sample catalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockResolvedValue({ assets: [probeAsset], problems: [] });
    mocks.exportMasterWav.mockResolvedValue(exportResult);
    mocks.exportMasterMp3.mockResolvedValue({ ...exportResult, filename: "custom_master_120bpm.mp3", bitrateKbps: 192 });
    mocks.exportStemsZip.mockResolvedValue({ blob: new Blob(["z"]), filename: "custom_stems_120bpm.zip", gs1HostFailures: 0 });
  });

  it("passes the app's catalogue and a lane reporter into a WAV export, and says what happened to the lanes", async () => {
    // The mocked render calls the reporter the way `renderPatternOffline` does — one rendered lane and one that could not resolve.
    mocks.exportMasterWav.mockImplementation(async (_pattern: unknown, _genre: string, options: { onAudioLanes?: (r: unknown) => void }) => {
      options.onAudioLanes?.({
        lanes: [{ trackIndex: 0, track_id: "audio", name: "Drums" }],
        events: 1,
        problems: [{ trackIndex: 1, track_id: "audio", name: "Vox", assetId: "vox", reason: 'no sample "vox"' }],
      });
      return exportResult;
    });

    const { result, showToast } = mount(audioPattern);
    await act(async () => {
      await result.current.handleExportWav();
    });

    expect(mocks.load).toHaveBeenCalledTimes(1);
    const [, genreId, options] = mocks.exportMasterWav.mock.calls[0]!;
    expect(genreId).toBe("custom");
    expect(options.audioLaneCatalogue).toEqual([probeAsset]);
    expect(typeof options.onAudioLanes).toBe("function");

    // Both lists reach the user: what rendered, and what did not with its reason.
    const message = showToast.mock.calls.at(-1)![0] as string;
    expect(message).toContain("Drums");
    expect(message).toContain("Vox");
    expect(message).toContain('no sample "vox"');
  });

  it("does not fetch the catalogue for a pattern with no audio lane, and passes no lane options", async () => {
    const { result } = mount(synthPattern);
    await act(async () => {
      await result.current.handleExportWav();
    });

    expect(mocks.load).not.toHaveBeenCalled();
    const options = mocks.exportMasterWav.mock.calls[0]![2] as Record<string, unknown>;
    expect(options.audioLaneCatalogue).toBeUndefined();
    expect(options.onAudioLanes).toBeUndefined();
  });

  it("accumulates the per-stem reports, so a problem found in one stem still reaches the toast", async () => {
    mocks.exportStemsZip.mockImplementation(async (_pattern: unknown, _genre: string, options: { onAudioLanes?: (r: unknown) => void }) => {
      options.onAudioLanes?.({ lanes: [{ trackIndex: 0, track_id: "audio", name: "Riser" }], events: 1, problems: [] });
      options.onAudioLanes?.({
        lanes: [],
        events: 0,
        problems: [{ trackIndex: 1, track_id: "audio", name: "Vox", assetId: "vox", reason: 'no sample "vox"' }],
      });
      return { blob: new Blob(["z"]), filename: "custom_stems_120bpm.zip", gs1HostFailures: 0 };
    });

    const { result, showToast } = mount(audioPattern);
    await act(async () => {
      await result.current.handleExportStems();
    });

    const options = mocks.exportStemsZip.mock.calls[0]![2] as Record<string, unknown>;
    expect(options.audioLaneCatalogue).toEqual([probeAsset]);
    const message = showToast.mock.calls.at(-1)![0] as string;
    // Both stems' facts are present: keeping only the last report would drop Riser and the earlier failure.
    expect(message).toContain("Riser");
    expect(message).toContain("Vox");
  });
});
