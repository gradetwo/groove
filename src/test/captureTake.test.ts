import { describe, expect, it, vi, beforeEach } from "vitest";
import { captureTake, stopCapture, type CaptureDependencies, type RecorderLike } from "../audio/captureTake";
import { createMemoryRecordingStore } from "../audio/recordingStore";
import { resetTakeIdsForTests } from "../data/takePlanning";

/**
 * The capture's rules, checked without a microphone — because the microphone is the one part that is not this code's.
 *
 * What is checked is what goes wrong around the browser call: **a stream left running**, a refusal turned into an empty take, and captured bytes that fail to store being reported as success.
 */
beforeEach(() => resetTakeIdsForTests());

function fakeDeps(overrides: Partial<CaptureDependencies> = {}) {
  const recorder: RecorderLike & { fire: (bytes: ArrayBuffer) => void } = {
    start: vi.fn(),
    stop: vi.fn(() => recorder.onstop?.()),
    ondataavailable: null,
    onstop: null,
    onerror: null,
    fire(bytes) {
      // The fake mirrors the real API's shape: a chunk is something whose bytes are read asynchronously.
      recorder.ondataavailable?.({ data: { arrayBuffer: async () => bytes } });
    },
  };
  const stream = { id: "stream" };
  const stopStream = vi.fn();
  const deps: CaptureDependencies = {
    requestStream: vi.fn(async () => stream),
    createRecorder: vi.fn(() => recorder),
    stopStream,
    store: createMemoryRecordingStore(),
    ...overrides,
  };
  return { deps, recorder, stream, stopStream };
}

describe("capturing a take", () => {
  it("stores the bytes and plans a take, releasing the microphone afterwards", async () => {
    const { deps, recorder, stream, stopStream } = fakeDeps();
    const pending = captureTake(deps, { source: "audio", recordedAt: 5, startBar: 4, endBar: 8 });
    // Give the awaiting body a turn to attach the recorder's handlers before the capture ends.
    await Promise.resolve();
    recorder.fire(new TextEncoder().encode("take one").buffer);
    stopCapture(stream);
    const outcome = await pending;

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.planned.region).toEqual({ startBar: 4, endBar: 8, takeId: outcome.planned.take.id });
    // ⭐ A stream left running is a recording light the user cannot turn off: releasing it is part of the capture, not a caller's job.
    expect(stopStream).toHaveBeenCalledWith(stream);
  });

  it("reports a refused permission and produces no take at all", async () => {
    const refusal = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    const { deps, stopStream } = fakeDeps({ requestStream: vi.fn(async () => Promise.reject(refusal)) });
    const outcome = await captureTake(deps, { source: "audio" });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    // An empty take would silently replace whatever was on the track; a refusal has to be a refusal.
    expect(outcome.refusal).toBe("permission-denied");
    // No stream was ever obtained, so there is nothing to release — and asking to release one would be its own bug.
    expect(stopStream).not.toHaveBeenCalled();
  });

  it("reports a storage failure rather than presenting a recording of silence", async () => {
    const { deps, recorder, stream, stopStream } = fakeDeps({
      store: {
        put: vi.fn(async () => Promise.reject(new Error("quota exceeded"))),
        get: vi.fn(),
        remove: vi.fn(),
        list: vi.fn(),
      } as never,
    });
    const pending = captureTake(deps, { source: "audio" });
    await Promise.resolve();
    recorder.fire(new ArrayBuffer(4));
    stopCapture(stream);
    const outcome = await pending;

    expect(outcome.ok).toBe(false);
    // The take exists in the arrangement and its bytes do not: reporting success would make that indistinguishable from a quiet recording.
    expect(stopStream).toHaveBeenCalledWith(stream);
  });
});
