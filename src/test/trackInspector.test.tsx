import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "../i18n/LanguageContext";
import {
  INSERT_COMP_MAX_ATTACK_SEC,
  INSERT_COMP_MAX_MAKEUP_DB,
  INSERT_COMP_MAX_RATIO,
  INSERT_COMP_MAX_RELEASE_SEC,
  INSERT_COMP_MAX_THRESHOLD_DB,
  INSERT_COMP_MIN_ATTACK_SEC,
  INSERT_COMP_MIN_MAKEUP_DB,
  INSERT_COMP_MIN_RATIO,
  INSERT_COMP_MIN_RELEASE_SEC,
  INSERT_COMP_MIN_THRESHOLD_DB,
  INSERT_DRIVE_MAX,
  INSERT_DRIVE_MIN,
  INSERT_EQ_MAX_GAIN_DB,
  INSERT_EQ_MAX_HZ,
  INSERT_EQ_MAX_Q,
  INSERT_EQ_MIN_GAIN_DB,
  INSERT_EQ_MIN_HZ,
  INSERT_EQ_MIN_Q,
  INSERT_HPF_MAX_HZ,
  INSERT_HPF_MIN_HZ,
  INSERT_ROLES,
  ROLE_INSERT_DEFAULTS,
  bypassTrackInsert,
  resolveTrackInsert,
  type TrackInsertParams,
} from "../data/trackInsert";
import type { MixTrackId } from "../data/genreMix";
import {
  TrackInspector,
  clampInspectorValue,
  type TrackInspectorProps,
} from "../components/console/TrackInspector";

/**
 * E-10 UI — the per-track inspector.
 *
 * These tests pin the two things that make the panel safe to wire into the studio:
 *
 *   1. **Every control is a real control.** Each numeric slider emits through its own
 *      callback, already clamped to the frozen `INSERT_*` bounds (or 0..1 / -1..1 for
 *      the mix fields), and every stage switch emits the exact `Partial<TrackInsertParams>`
 *      the host needs. No control is decorative.
 *   2. **It is presentational.** Props in, callbacks out — the tests drive it entirely
 *      through props and never touch a store or an engine.
 */

const INSTRUMENTS = ["TR-909 Kit", "TR-808 Kit", "LinnDrum", "Acoustic"] as const;

function makeInsert(overrides: Partial<TrackInsertParams> = {}): TrackInsertParams {
  return { ...resolveTrackInsert("kick"), ...overrides };
}

function makeHandlers() {
  return {
    onInstrumentChange: vi.fn(),
    onVolumeChange: vi.fn(),
    onPanChange: vi.fn(),
    onSendAChange: vi.fn(),
    onSendBChange: vi.fn(),
    onMuteToggle: vi.fn(),
    onSoloToggle: vi.fn(),
    onChangeInsert: vi.fn(),
    onResetInsert: vi.fn(),
    onBypassInsert: vi.fn(),
    onClose: vi.fn(),
  };
}
type Handlers = ReturnType<typeof makeHandlers>;

function setup(overrides: Partial<TrackInspectorProps> = {}) {
  const handlers = makeHandlers();
  const props: TrackInspectorProps = {
    role: "kick",
    trackName: "Kick",
    instrument: INSTRUMENTS[0],
    instrumentOptions: INSTRUMENTS,
    volume: 0.8,
    pan: 0,
    sendA: 0.2,
    sendB: 0.1,
    muted: false,
    soloed: false,
    insert: makeInsert(),
    ...handlers,
    ...overrides,
  };
  const utils = render(
    <LanguageProvider>
      <TrackInspector {...props} />
    </LanguageProvider>
  );
  return { ...utils, handlers, props };
}

// ---------------------------------------------------------------------------
// Numeric clamping tables
// ---------------------------------------------------------------------------

type MixSpy = "onVolumeChange" | "onPanChange" | "onSendAChange" | "onSendBChange";

interface ChangeCase {
  label: string;
  testId: string;
  fire: string;
  expected: number;
  kind: "mix" | "insert";
  spy?: MixSpy;
  extract?: (patch: Partial<TrackInsertParams>) => number | undefined;
}

interface MixFamily {
  testId: string;
  min: number;
  max: number;
  spy: MixSpy;
}

interface InsertFamily {
  testId: string;
  min: number;
  max: number;
  extract: (patch: Partial<TrackInsertParams>) => number | undefined;
}

const MIX_FAMILIES: MixFamily[] = [
  { testId: "track-inspector-volume", min: 0, max: 1, spy: "onVolumeChange" },
  { testId: "track-inspector-pan", min: -1, max: 1, spy: "onPanChange" },
  { testId: "track-inspector-send-a", min: 0, max: 1, spy: "onSendAChange" },
  { testId: "track-inspector-send-b", min: 0, max: 1, spy: "onSendBChange" },
];

const INSERT_FAMILIES: InsertFamily[] = [
  { testId: "track-inspector-hpf-hz", min: INSERT_HPF_MIN_HZ, max: INSERT_HPF_MAX_HZ, extract: (p) => p.hpfHz },
  { testId: "track-inspector-low-hz", min: INSERT_EQ_MIN_HZ, max: INSERT_EQ_MAX_HZ, extract: (p) => p.low?.hz },
  { testId: "track-inspector-low-gain", min: INSERT_EQ_MIN_GAIN_DB, max: INSERT_EQ_MAX_GAIN_DB, extract: (p) => p.low?.gainDb },
  { testId: "track-inspector-mid-hz", min: INSERT_EQ_MIN_HZ, max: INSERT_EQ_MAX_HZ, extract: (p) => p.mid?.hz },
  { testId: "track-inspector-mid-gain", min: INSERT_EQ_MIN_GAIN_DB, max: INSERT_EQ_MAX_GAIN_DB, extract: (p) => p.mid?.gainDb },
  { testId: "track-inspector-mid-q", min: INSERT_EQ_MIN_Q, max: INSERT_EQ_MAX_Q, extract: (p) => p.mid?.q },
  { testId: "track-inspector-high-hz", min: INSERT_EQ_MIN_HZ, max: INSERT_EQ_MAX_HZ, extract: (p) => p.high?.hz },
  { testId: "track-inspector-high-gain", min: INSERT_EQ_MIN_GAIN_DB, max: INSERT_EQ_MAX_GAIN_DB, extract: (p) => p.high?.gainDb },
  { testId: "track-inspector-comp-threshold", min: INSERT_COMP_MIN_THRESHOLD_DB, max: INSERT_COMP_MAX_THRESHOLD_DB, extract: (p) => p.compThresholdDb },
  { testId: "track-inspector-comp-ratio", min: INSERT_COMP_MIN_RATIO, max: INSERT_COMP_MAX_RATIO, extract: (p) => p.compRatio },
  { testId: "track-inspector-comp-attack", min: INSERT_COMP_MIN_ATTACK_SEC, max: INSERT_COMP_MAX_ATTACK_SEC, extract: (p) => p.compAttackSec },
  { testId: "track-inspector-comp-release", min: INSERT_COMP_MIN_RELEASE_SEC, max: INSERT_COMP_MAX_RELEASE_SEC, extract: (p) => p.compReleaseSec },
  { testId: "track-inspector-comp-makeup", min: INSERT_COMP_MIN_MAKEUP_DB, max: INSERT_COMP_MAX_MAKEUP_DB, extract: (p) => p.compMakeupDb },
  { testId: "track-inspector-drive-amount", min: INSERT_DRIVE_MIN, max: INSERT_DRIVE_MAX, extract: (p) => p.driveAmount },
  { testId: "track-inspector-drive-mix", min: 0, max: 1, extract: (p) => p.driveMix },
];

function buildChangeCases(): ChangeCase[] {
  const cases: ChangeCase[] = [];
  for (const family of MIX_FAMILIES) {
    cases.push({
      label: `${family.testId} clamps above max`,
      testId: family.testId,
      fire: String(family.max + 1),
      expected: family.max,
      kind: "mix",
      spy: family.spy,
    });
    cases.push({
      label: `${family.testId} clamps below min`,
      testId: family.testId,
      fire: String(family.min - 1),
      expected: family.min,
      kind: "mix",
      spy: family.spy,
    });
  }
  for (const family of INSERT_FAMILIES) {
    cases.push({
      label: `${family.testId} clamps above max`,
      testId: family.testId,
      fire: String(family.max + 1),
      expected: family.max,
      kind: "insert",
      extract: family.extract,
    });
    cases.push({
      label: `${family.testId} clamps below min`,
      testId: family.testId,
      fire: String(family.min - 1),
      expected: family.min,
      kind: "insert",
      extract: family.extract,
    });
  }
  return cases;
}

const CHANGE_CASES = buildChangeCases();

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("groove_language", "en");
});

describe("TrackInspector · layout and sections", () => {
  it("renders the panel with all three labelled sections", () => {
    setup();

    const panel = screen.getByTestId("track-inspector");
    expect(panel).toHaveAttribute("data-inspector-role", "kick");
    expect(panel).toHaveAttribute("data-insert-bypassed", "false");

    expect(screen.getByTestId("track-inspector-section-timbre")).toBeInTheDocument();
    expect(screen.getByTestId("track-inspector-section-mix")).toBeInTheDocument();
    expect(screen.getByTestId("track-inspector-section-effects")).toBeInTheDocument();
  });

  it("exposes every interactive control exactly once", () => {
    setup();
    const panel = screen.getByTestId("track-inspector");
    const controls = panel.querySelectorAll("input, select, button");
    // 19 numeric sliders + 1 instrument select + 6 stage switches + mute/solo
    // + reset/bypass + close.
    expect(controls).toHaveLength(31);
  });

  it("shows the track name and closes through the header button", () => {
    const { handlers } = setup({ trackName: "Snare Top" });
    expect(screen.getByRole("heading", { level: 2, name: "Snare Top" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("track-inspector-close"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TrackInspector · timbre picker", () => {
  it("lists every instrument option and reports the chosen one", () => {
    const { handlers } = setup();
    const select = screen.getByTestId("track-inspector-instrument") as HTMLSelectElement;

    expect(Array.from(select.options).map((option) => option.value)).toEqual([...INSTRUMENTS]);
    expect(select.value).toBe(INSTRUMENTS[0]);

    fireEvent.change(select, { target: { value: "TR-808 Kit" } });
    expect(handlers.onInstrumentChange).toHaveBeenCalledTimes(1);
    expect(handlers.onInstrumentChange).toHaveBeenCalledWith("TR-808 Kit");
  });

  it("keeps a stale current preset selectable instead of rendering blank", () => {
    setup({ instrument: "Vintage Kit (removed)" });
    const select = screen.getByTestId("track-inspector-instrument") as HTMLSelectElement;
    expect(Array.from(select.options).map((option) => option.value)).toContain(
      "Vintage Kit (removed)"
    );
    expect(select.value).toBe("Vintage Kit (removed)");
  });
});

describe("TrackInspector · numeric controls clamp before calling back", () => {
  it.each(CHANGE_CASES)("$label", (testCase) => {
    const { handlers } = setup();

    fireEvent.change(screen.getByTestId(testCase.testId), {
      target: { value: testCase.fire },
    });

    if (testCase.kind === "mix") {
      const fn = handlers[testCase.spy as MixSpy];
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn.mock.calls[0][0] as number).toBeCloseTo(testCase.expected, 6);
      return;
    }

    const fn = handlers.onChangeInsert;
    expect(fn).toHaveBeenCalledTimes(1);
    const patch = fn.mock.calls[0][0] as Partial<TrackInsertParams>;
    expect(testCase.extract!(patch) as number).toBeCloseTo(testCase.expected, 6);
  });

  it("renders a host-supplied out-of-range value at the bound, never beyond it", () => {
    setup({ volume: 5, pan: -9, sendA: 3, insert: makeInsert({ hpfHz: 99_999, driveMix: 4 }) });

    expect((screen.getByTestId("track-inspector-volume") as HTMLInputElement).value).toBe("1");
    expect((screen.getByTestId("track-inspector-pan") as HTMLInputElement).value).toBe("-1");
    expect((screen.getByTestId("track-inspector-send-a") as HTMLInputElement).value).toBe("1");
    expect((screen.getByTestId("track-inspector-hpf-hz") as HTMLInputElement).value).toBe("1000");
    expect((screen.getByTestId("track-inspector-drive-mix") as HTMLInputElement).value).toBe("1");
  });

  it("clamps every insert family against its frozen bound at the helper level", () => {
    for (const family of INSERT_FAMILIES) {
      expect(clampInspectorValue(family.min - 1000, family.min, family.max)).toBe(family.min);
      expect(clampInspectorValue(family.max + 1000, family.min, family.max)).toBe(family.max);
      expect(clampInspectorValue((family.min + family.max) / 2, family.min, family.max)).toBeCloseTo(
        (family.min + family.max) / 2,
        6
      );
    }
  });

  it("guards non-finite input instead of emitting NaN", () => {
    expect(clampInspectorValue(Number.NaN, 0.2, 12)).toBe(0.2);
    expect(clampInspectorValue(Number.POSITIVE_INFINITY, 0, 1)).toBe(1);
    expect(clampInspectorValue(Number.NEGATIVE_INFINITY, 0, 1)).toBe(0);
    expect(clampInspectorValue(0.4, 0, 1)).toBe(0.4);
  });
});

describe("TrackInspector · stage switches emit the right insert patch", () => {
  const base = resolveTrackInsert("kick");

  it.each([
    { label: "high-pass", testId: "track-inspector-hpf-enable", expected: { hpfEnabled: !base.hpfEnabled } },
    { label: "low shelf", testId: "track-inspector-low-enable", expected: { low: { ...base.low, enabled: !base.low.enabled } } },
    { label: "mid band", testId: "track-inspector-mid-enable", expected: { mid: { ...base.mid, enabled: !base.mid.enabled } } },
    { label: "high shelf", testId: "track-inspector-high-enable", expected: { high: { ...base.high, enabled: !base.high.enabled } } },
    { label: "compressor", testId: "track-inspector-comp-enable", expected: { compEnabled: !base.compEnabled } },
    { label: "drive", testId: "track-inspector-drive-enable", expected: { driveEnabled: !base.driveEnabled } },
  ])("$label enable switch emits the right patch", ({ testId, expected }) => {
    const { handlers } = setup({ insert: makeInsert() });

    fireEvent.click(screen.getByTestId(testId));

    expect(handlers.onChangeInsert).toHaveBeenCalledTimes(1);
    expect(handlers.onChangeInsert).toHaveBeenCalledWith(expected);
  });

  it("reflects the stage enable flags through aria-pressed", () => {
    setup({ insert: makeInsert() });

    // kick factory chain: hpf/low/mid/comp on, high/drive off.
    expect(screen.getByTestId("track-inspector-hpf-enable")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("track-inspector-low-enable")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("track-inspector-mid-enable")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("track-inspector-high-enable")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("track-inspector-comp-enable")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("track-inspector-drive-enable")).toHaveAttribute("aria-pressed", "false");
  });
});

describe("TrackInspector · mute / solo state", () => {
  it("marks mute and solo pressed when their props are set, with an active class", () => {
    setup({ muted: true, soloed: true });

    const mute = screen.getByTestId("track-inspector-mute");
    const solo = screen.getByTestId("track-inspector-solo");
    expect(mute).toHaveAttribute("aria-pressed", "true");
    expect(solo).toHaveAttribute("aria-pressed", "true");
    expect(mute.className).toContain("#ff5964");
    expect(solo.className).toContain("accent");
  });

  it("marks mute and solo unpressed when their props are clear", () => {
    setup({ muted: false, soloed: false });

    expect(screen.getByTestId("track-inspector-mute")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("track-inspector-solo")).toHaveAttribute("aria-pressed", "false");
  });

  it("fires the toggles", () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByTestId("track-inspector-mute"));
    fireEvent.click(screen.getByTestId("track-inspector-solo"));

    expect(handlers.onMuteToggle).toHaveBeenCalledTimes(1);
    expect(handlers.onSoloToggle).toHaveBeenCalledTimes(1);
  });
});

describe("TrackInspector · reset and bypass affordances", () => {
  it("fires reset and bypass without emitting an insert patch of its own", () => {
    const { handlers } = setup();

    fireEvent.click(screen.getByTestId("track-inspector-reset"));
    expect(handlers.onResetInsert).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId("track-inspector-bypass"));
    expect(handlers.onBypassInsert).toHaveBeenCalledTimes(1);

    // The host owns what reset/bypass mean; the panel must not second-guess it.
    expect(handlers.onChangeInsert).not.toHaveBeenCalled();
  });

  it("shows a bypassed badge exactly when every stage is off", () => {
    const { unmount } = setup({ insert: makeInsert() });
    expect(screen.queryByTestId("track-inspector-bypassed-badge")).toBeNull();
    unmount();

    setup({ insert: bypassTrackInsert() });
    expect(screen.getByTestId("track-inspector-bypassed-badge")).toBeInTheDocument();
    expect(screen.getByTestId("track-inspector")).toHaveAttribute("data-insert-bypassed", "true");
  });
});

describe("TrackInspector · accessibility", () => {
  it("gives every control an accessible name", () => {
    setup();
    const panel = screen.getByTestId("track-inspector");
    const controls = Array.from(panel.querySelectorAll<HTMLElement>("input, select, button"));

    expect(controls.length).toBeGreaterThan(0);
    for (const control of controls) {
      expect(control).toHaveAccessibleName();
    }
  });

  it("names the panel region after the track", () => {
    setup({ trackName: "Lead Synth" });
    const panel = screen.getByTestId("track-inspector");
    expect(panel).toHaveAccessibleName();
    expect(panel.getAttribute("aria-label")).toContain("Lead Synth");
  });
});

describe("TrackInspector · every role renders", () => {
  it("covers all eight insert roles", () => {
    expect(INSERT_ROLES).toHaveLength(8);
    expect([...INSERT_ROLES].sort()).toEqual(Object.keys(ROLE_INSERT_DEFAULTS).sort());
  });

  it("renders without crashing for all eight roles", () => {
    const roles = Object.entries(ROLE_INSERT_DEFAULTS) as [MixTrackId, TrackInsertParams][];
    expect(roles).toHaveLength(8);

    for (const [role, insert] of roles) {
      const { unmount } = setup({
        role,
        insert: {
          ...insert,
          low: { ...insert.low },
          mid: { ...insert.mid },
          high: { ...insert.high },
        },
      });
      expect(screen.getByTestId("track-inspector")).toHaveAttribute("data-inspector-role", role);
      expect(screen.getByTestId("track-inspector-instrument")).toBeInTheDocument();
      unmount();
    }
  });
});
