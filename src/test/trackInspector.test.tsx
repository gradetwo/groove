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
import { INSTRUMENT_PRESET_ALIASES } from "../audio/instrumentPresets";
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

  it("exposes every named control exactly once", () => {
    // A raw control count stopped being meaningful when the flat instrument <select> became a
    // categorized picker (search + chips + one row per timbre). What must not regress is that no
    // control is duplicated or lost: every testid below is asserted to exist exactly once.
    setup();
    const panel = screen.getByTestId("track-inspector");
    const uniqueIds = [
      "track-inspector-close",
      "track-inspector-instrument",
      "track-inspector-instrument-search",
      "track-inspector-mute",
      "track-inspector-solo",
      "track-inspector-reset",
      "track-inspector-bypass",
      "track-inspector-hpf-enable",
      "track-inspector-low-enable",
      "track-inspector-mid-enable",
      "track-inspector-high-enable",
      "track-inspector-comp-enable",
      "track-inspector-drive-enable",
    ];
    for (const id of uniqueIds) {
      expect(panel.querySelectorAll(`[data-testid="${id}"]`), id).toHaveLength(1);
    }
    // The sliders remain one per parameter (19 of them) — the picker must not have disturbed them.
    const sliders = panel.querySelectorAll("input[type='range']");
    expect(sliders.length).toBeGreaterThanOrEqual(19);
  });

  it("shows the track name and closes through the header button", () => {
    const { handlers } = setup({ trackName: "Snare Top" });
    expect(screen.getByRole("heading", { level: 2, name: "Snare Top" })).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("track-inspector-close"));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

describe("TrackInspector · timbre picker", () => {
  it("lists every instrument, optionally filtered by category and by search", () => {
    const { handlers } = setup();
    // Every option is reachable: search for each name in turn and require its row to appear.
    const search = screen.getByTestId("track-inspector-instrument-search");
    for (const name of INSTRUMENTS) {
      fireEvent.change(search, { target: { value: name } });
      expect(screen.getByTestId(`track-inspector-instrument-option-${name}`), name).toBeInTheDocument();
    }

    fireEvent.change(search, { target: { value: "" } });
    // A category chip narrows the list without hiding the search box.
    const firstChip = screen.getByTestId(/track-inspector-instrument-category-(?!all)/);
    fireEvent.click(firstChip);
    expect(screen.getByTestId("track-inspector-instrument-count")).toBeInTheDocument();

    // And clicking a row reports the choice.
    fireEvent.change(search, { target: { value: "TR-808 Kit" } });
    fireEvent.click(screen.getByTestId("track-inspector-instrument-option-TR-808 Kit"));
    expect(handlers.onInstrumentChange).toHaveBeenCalledWith("TR-808 Kit");
  });

  it("keeps a stale current preset reachable instead of rendering blank", () => {
    setup({ instrument: "Vintage Kit (removed)" });
    // The picker derives its categories from the option list, so an option the host no longer
    // ships must still be listed (and selected) rather than silently dropped.
    fireEvent.change(screen.getByTestId("track-inspector-instrument-search"), {
      target: { value: "Vintage Kit (removed)" },
    });
    expect(
      screen.getByTestId("track-inspector-instrument-option-Vintage Kit (removed)")
    ).toBeInTheDocument();
  });

  it("says so when nothing matches instead of showing an empty box", () => {
    setup();
    fireEvent.change(screen.getByTestId("track-inspector-instrument-search"), {
      target: { value: "zzz-nothing" },
    });
    expect(screen.getByTestId("track-inspector-instrument-empty")).toBeInTheDocument();
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

/**
 * Item ② — the inspector floats above the current layer on phones and docks left on desktop.
 *
 * It used to render in normal flow *after* the sequencer, so on a phone it appeared below
 * everything (and on desktop it pushed the layout). A floating panel also has to be dismissible by
 * more than a small button, hence the scrim and Escape assertions.
 */
describe("TrackInspector · placement", () => {
  it("floats above the studio on phones and docks to the left on desktop", () => {
    setup();
    const panel = screen.getByTestId("track-inspector");
    /**
     * Phones: pinned above the tab bar, never in the document flow.
     *
     * The offset is not `bottom-0` on purpose. The phone tab bar is `z-[70]` and fixed over the
     * bottom of the viewport, so a sheet at `bottom-0 z-50` had its last ~52 px covered by the bar
     * — and on a landscape phone, where this sheet is only ~279 px tall, that is the whole EQ
     * canvas. The measured symptom was an EQ band handle whose hit test resolved to a tab-bar
     * button, so a drag on it never reached the control. Asserting the offset makes the overlap a
     * failing test rather than a geometry bug that only a device matrix could see.
     */
    expect(panel.className).toContain("fixed");
    expect(panel.className).toContain("inset-x-0");
    expect(panel.className).toContain("bottom-[var(--mobile-tab-bar-h)]");
    // Desktop: a full-height left dock, so the sequencer stays visible while editing.
    expect(panel.className).toContain("lg:inset-y-0");
    expect(panel.className).toContain("lg:left-0");
    expect(panel.className).toContain("lg:w-[400px]");
    // It scrolls internally rather than stretching the page.
    expect(panel.className).toContain("overflow-y-auto");
  });

  it("dims the studio only on phones (a desktop dock must not block the view)", () => {
    const { handlers } = setup();
    const scrim = screen.getByTestId("track-inspector-scrim");
    expect(scrim.className).toContain("lg:hidden");

    fireEvent.click(screen.getByTestId("track-inspector-scrim"));
    expect(handlers.onClose).toHaveBeenCalled();
  });

  it("closes on Escape, like every other overlay", () => {
    const { handlers } = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    // Other keys must not close it: it stays open while the track is edited.
    fireEvent.keyDown(window, { key: "a" });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });
});

/**
 * Item ③ of the follow-up: "the inspector takes up too much room — consider collapsing or tabs".
 *
 * Three tabs now hold the three groups, and the two controls that must never be a tab away — mute
 * and solo — moved into the header. Sections stay *mounted* and are toggled with the `hidden`
 * attribute, so switching is instant and control state (a slider mid-drag, a search query) is not
 * thrown away.
 */
describe("TrackInspector · tabs and compactness", () => {
  it("offers three tabs and shows exactly one section at a time", () => {
    setup();
    for (const tab of ["timbre", "mix", "effects"]) {
      expect(screen.getByTestId(`track-inspector-tab-${tab}`)).toBeInTheDocument();
    }
    const section = (id: string) => screen.getByTestId(`track-inspector-section-${id}`) as HTMLElement;
    expect(screen.getByTestId("track-inspector-tab-timbre")).toHaveAttribute("aria-selected", "true");
    expect(section("timbre").hidden).toBe(false);
    expect(section("mix").hidden).toBe(true);
    expect(section("effects").hidden).toBe(true);
  });

  it("switches sections without unmounting them", () => {
    setup();
    const section = (id: string) => screen.getByTestId(`track-inspector-section-${id}`) as HTMLElement;

    fireEvent.click(screen.getByTestId("track-inspector-tab-mix"));
    expect(section("mix").hidden).toBe(false);
    expect(section("timbre").hidden).toBe(true);
    // Still in the document: a slider keeps its position and a picker keeps its query.
    expect(screen.getByTestId("track-inspector-volume")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("track-inspector-tab-effects"));
    expect(section("effects").hidden).toBe(false);
    expect(section("mix").hidden).toBe(true);
    expect(screen.getByTestId("track-inspector-reset")).toBeInTheDocument();
  });

  it("keeps mute and solo reachable from every tab", () => {
    const { handlers } = setup();
    fireEvent.click(screen.getByTestId("track-inspector-tab-effects"));
    // They live in the header, not inside a section, so no tab can hide them.
    const mute = screen.getByTestId("track-inspector-mute");
    const solo = screen.getByTestId("track-inspector-solo");
    expect(mute.closest("[hidden]")).toBeNull();
    expect(solo.closest("[hidden]")).toBeNull();

    fireEvent.click(mute);
    expect(handlers.onMuteToggle).toHaveBeenCalled();
  });
});

/**
 * Regression: the timbre picker must not scope itself to the current instrument.
 *
 * Reported from use: "the drum kits were two, and after choosing one only one was left". Two things
 * were wrong. (1) The picker opened with the category filter set to the *current instrument's*
 * family — a kick's family is `drums`, which holds two entries, so a drum track showed "2 of 116"
 * and hid every other timbre. (2) A current value that is not a preset name (a kick track's
 * instrument is a kick preset) was listed as an extra entry, so choosing a real preset made the
 * list shrink by one under the user's finger.
 */
describe("TrackInspector · the timbre picker does not hide the list", () => {
  const options = Object.keys(INSTRUMENT_PRESET_ALIASES);

  const renderWithInstrument = (instrument: string, onChange = vi.fn()) => {
    const utils = render(
      <TrackInspector
        role={"kick" as MixTrackId}
        trackName="Kick Drum"
        instrument={instrument}
        instrumentOptions={options}
        onInstrumentChange={onChange}
        volume={0.8}
        pan={0}
        sendA={0}
        sendB={0}
        muted={false}
        soloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onSendAChange={vi.fn()}
        onSendBChange={vi.fn()}
        insert={resolveTrackInsert("kick")}
        onClose={vi.fn()}
        onMuteToggle={vi.fn()}
        onSoloToggle={vi.fn()}
        onChangeInsert={vi.fn()}
        onResetInsert={vi.fn()}
        onBypassInsert={vi.fn()}
      />
    );
    return { ...utils, onChange };
  };

  it("opens on every timbre, not on the current instrument's family", () => {
    renderWithInstrument("punchy_kick");
    // The "all" chip is active…
    expect(screen.getByTestId("track-inspector-instrument-category-all").getAttribute("aria-pressed")).toBe("true");
    // …and the list is the whole table, not the two drum entries.
    const rendered = screen.getAllByTestId(/track-inspector-instrument-option-/);
    expect(rendered.length).toBeGreaterThan(100);
    expect(screen.getByTestId("track-inspector-instrument-option-reese_bass")).toBeInTheDocument();
  });

  it("keeps the current non-preset value listed, and says that it is not a preset", () => {
    renderWithInstrument("punchy_kick");
    expect(screen.getByTestId("track-inspector-instrument-option-punchy_kick")).toBeInTheDocument();
    expect(screen.getByTestId("track-inspector-instrument-unlisted")).toBeInTheDocument();
  });

  it("still shows every timbre after a preset replaces the non-preset value", () => {
    const { rerender, onChange } = renderWithInstrument("punchy_kick");
    fireEvent.click(screen.getByTestId("track-inspector-instrument-option-distorted_kick"));
    expect(onChange).toHaveBeenCalledWith("distorted_kick");

    // The parent commits the choice and the panel re-renders with the new instrument: the list
    // must stay complete (this is the state the report described as "only one left").
    rerender(
      <TrackInspector
        role={"kick" as MixTrackId}
        trackName="Kick Drum"
        instrument="distorted_kick"
        instrumentOptions={options}
        onInstrumentChange={onChange}
        volume={0.8}
        pan={0}
        sendA={0}
        sendB={0}
        muted={false}
        soloed={false}
        onVolumeChange={vi.fn()}
        onPanChange={vi.fn()}
        onSendAChange={vi.fn()}
        onSendBChange={vi.fn()}
        insert={resolveTrackInsert("kick")}
        onClose={vi.fn()}
        onMuteToggle={vi.fn()}
        onSoloToggle={vi.fn()}
        onChangeInsert={vi.fn()}
        onResetInsert={vi.fn()}
        onBypassInsert={vi.fn()}
      />
    );
    const after = screen.getAllByTestId(/track-inspector-instrument-option-/);
    expect(after.length).toBeGreaterThan(100);
    // And the replaced value is gone, which is correct — it is no longer this track's timbre.
    expect(screen.queryByTestId("track-inspector-instrument-option-punchy_kick")).toBeNull();
    expect(screen.queryByTestId("track-inspector-instrument-unlisted")).toBeNull();
  });
});
