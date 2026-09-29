import { describe, expect, it, beforeEach } from "vitest";
import { classifyCaptureRefusal, planTakeFromCapture, resetTakeIdsForTests } from "../data/takePlanning";

/**
 * What a capture becomes, and why it could not start — the two things a user notices, both decided without a browser.
 *
 * Recording is a browser affair; the *rules* are not. Keeping them here means "does a section capture get a region" and "what does a user read when permission is refused" are answered by criteria instead of by
 * trying it with a microphone attached.
 */
beforeEach(() => resetTakeIdsForTests());
const bytes = () => new ArrayBuffer(4);

describe("planning a take from a capture", () => {
  it("gives a take its source, and no region when the capture covered no range", () => {
    const { take, region } = planTakeFromCapture({ bytes: bytes(), source: "midi", recordedAt: 100 });
    // A take with no region is a real state: a whole-performance recording is not "that section".
    expect(take.source).toBe("midi");
    expect(region).toBeUndefined();
  });

  it("gives a ranged capture a region that something can actually fall into", () => {
    const { take, region } = planTakeFromCapture({ bytes: bytes(), source: "audio", recordedAt: 200, startBar: 8, endBar: 16 });
    expect(region).toEqual({ startBar: 8, endBar: 16, takeId: take.id });
  });

  it("refuses to make a region out of an empty or backwards range", () => {
    // A region nothing falls into would look exactly like a take that never plays, which is the kind of silence nobody can trace.
    expect(planTakeFromCapture({ bytes: bytes(), source: "audio", recordedAt: 1, startBar: 8, endBar: 8 }).region).toBeUndefined();
    expect(planTakeFromCapture({ bytes: bytes(), source: "audio", recordedAt: 1, startBar: 16, endBar: 8 }).region).toBeUndefined();
    // And a range with only one end given is not a range either.
    expect(planTakeFromCapture({ bytes: bytes(), source: "audio", recordedAt: 1, startBar: 8 }).region).toBeUndefined();
  });

  it("names a refused permission as something the user can fix themselves", () => {
    const refused = Object.assign(new Error("nope"), { name: "NotAllowedError" });
    const classified = classifyCaptureRefusal(refused);
    // Separated from the other failures because it is the only one a user can act on, and "recording failed" would hide that.
    expect(classified.refusal).toBe("permission-denied");
    expect(classified.summary).toMatch(/Grant it for this site/);
  });

  it("separates a missing device from an unsupported browser and from an unknown failure", () => {
    expect(classifyCaptureRefusal(Object.assign(new Error("x"), { name: "NotFoundError" })).refusal).toBe("no-device");
    // ⭐ Every API present and the browser refusing anyway is its own case, not "this browser cannot record" — the probe found that sentence being said to a machine with a working microphone.
    expect(classifyCaptureRefusal(Object.assign(new Error("x"), { name: "NotSupportedError" })).refusal).toBe("unavailable");
    expect(classifyCaptureRefusal(Object.assign(new Error("x"), { name: "TypeError" })).refusal).toBe("failed");
    expect(classifyCaptureRefusal(new Error("mystery")).refusal).toBe("failed");
  });
});
