import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { captureMasterAudio, extensionForMimeType, pickRecorderMimeType } from "../platform/audioCapture";

/**
 * "Record what I hear" — the diagnostic capture.
 *
 * The interesting parts are not the recording itself but its **edges**: which container a browser will accept, what
 * extension that container gets, and — most of all — that the tap is unhooked afterwards and that a page with no running
 * engine says so instead of doing nothing. Six rounds of checking a stem render that the owner was not listening to is
 * the reason this exists; a button that silently fails would be worse than none.
 */
describe("the master capture", () => {
  it("picks the smallest container the browser supports, and falls back to letting it choose", () => {
    expect(pickRecorderMimeType((type) => type === "audio/webm;codecs=opus")).toBe("audio/webm;codecs=opus");
    // Safari: no WebM at all, but MP4/AAC.
    expect(pickRecorderMimeType((type) => type.startsWith("audio/mp4"))).toBe("audio/mp4;codecs=mp4a.40.2");
    // Nothing advertised: the recorder still gets a chance with its own default.
    expect(pickRecorderMimeType(() => false)).toBe("");
    // A browser that throws on unknown types is not a reason to fail.
    expect(
      pickRecorderMimeType((type) => {
        if (type.includes("opus")) throw new Error("unknown type");
        return type === "audio/mp4";
      })
    ).toBe("audio/mp4");
  });

  it("names the file after the container", () => {
    expect(extensionForMimeType("audio/webm;codecs=opus")).toBe("webm");
    expect(extensionForMimeType("audio/mp4")).toBe("m4a");
    expect(extensionForMimeType("audio/ogg")).toBe("ogg");
    expect(extensionForMimeType("")).toBe("webm");
  });

  it("tells the caller when there is no engine to record, rather than doing nothing", async () => {
    await expect(captureMasterAudio(1)).rejects.toThrow(/no running audio engine/i);
  });
});

/**
 * The happy path, with the browser APIs faked: the tap is connected, the recorder runs, the tap is disconnected, and the
 * file carries the mime type the recorder reported.
 */
describe("the master capture, with a fake engine", () => {
  const chunks = [new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" })];
  const tap = {
    context: {},
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  let engineModule: { getActiveAudioEngine: () => unknown };

  beforeEach(async () => {
    vi.resetModules();
    engineModule = await import("../audio/activeEngine");
    vi.spyOn(engineModule, "getActiveAudioEngine").mockReturnValue({
      getCaptureTap: () => tap,
    } as never);
    tap.connect.mockClear();
    tap.disconnect.mockClear();
    const context = {
      createMediaStreamDestination: () => ({ stream: { id: "fake-stream" } }),
    };
    tap.context = context;
    class FakeRecorder {
      static isTypeSupported = () => true;
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: chunks[0] });
        this.onstop?.();
      }
    }
    (globalThis as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeRecorder;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records, unhooks and returns the file", async () => {
    const capture = await import("../platform/audioCapture");
    vi.spyOn(capture, "captureMasterAudio");
    const result = await capture.captureMasterAudio(0.01);
    expect(tap.connect).toHaveBeenCalledTimes(1);
    expect(tap.disconnect).toHaveBeenCalledTimes(1);
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.filename).toMatch(/^groove-capture-.*\.webm$/);
    expect(result.seconds).toBeGreaterThan(0);
  });
});
