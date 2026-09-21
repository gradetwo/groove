/**
 * The kick canvases' skin palette: the pure parser and the fallback rule, plus the end-to-end claim
 * the re-skin exists for — a colour declared on `.mobile-root` actually reaches a canvas painter.
 *
 * The painter half is deliberately not a unit test of the hook. It mounts the real oscilloscope with
 * a recording 2D context and asserts what it *strokes and fills*, because the bug being fixed was
 * precisely "the value never arrives at the canvas": the hook and the parser could both be green
 * while the painter kept its literals.
 */
import React, { useEffect, useRef, useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import {
  canvasRgba,
  mixCanvasColors,
  parseCanvasColor,
  resolveCanvasColor,
} from "../utils/canvasPalette";
import { PhosphorOscilloscope } from "../components/kick/PhosphorOscilloscope";
import {
  DESKTOP_CANVAS_FALLBACKS,
  useCanvasPalette,
  type CanvasPaletteFallbacks,
} from "../components/kick/useCanvasPalette";

describe("parseCanvasColor", () => {
  it("parses the hex form a resolved token usually takes", () => {
    expect(parseCanvasColor("#f5b73d")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    expect(parseCanvasColor("#F5B73D")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    // `VinylCanvas`'s readings can arrive without the hash, and tokens can arrive with whitespace.
    expect(parseCanvasColor("  f5b73d ")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
  });

  it("parses rgb() in both the space and comma forms", () => {
    expect(parseCanvasColor("rgb(245 183 61)")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    expect(parseCanvasColor("rgb(245, 183, 61)")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    expect(parseCanvasColor("rgb(0 0 0)")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("parses rgba() and the slash-alpha form", () => {
    expect(parseCanvasColor("rgba(4, 5, 8, 0.26)")).toEqual({ r: 4, g: 5, b: 8, a: 0.26 });
    expect(parseCanvasColor("rgba(180 80 20 / 0.5)")).toEqual({ r: 180, g: 80, b: 20, a: 0.5 });
  });

  it("returns null for anything that is not a concrete colour, so the caller keeps its fallback", () => {
    // An unresolved variable is the case that matters most: it is what a canvas reads if the skin
    // never applied, and painting it would leave the *previous* style in place.
    expect(parseCanvasColor("var(--m-gold)")).toBeNull();
    expect(parseCanvasColor("")).toBeNull();
    expect(parseCanvasColor("   ")).toBeNull();
    expect(parseCanvasColor(undefined)).toBeNull();
    expect(parseCanvasColor(null)).toBeNull();
    expect(parseCanvasColor("rebeccapurple")).toBeNull();
    // 8-digit hex, out-of-range channels, a bad alpha and the wrong arity are all "not this parser's".
    expect(parseCanvasColor("#f5b73dff")).toBeNull();
    expect(parseCanvasColor("rgb(300 0 0)")).toBeNull();
    expect(parseCanvasColor("rgba(0, 0, 0, 2)")).toBeNull();
    expect(parseCanvasColor("rgb(1 2)")).toBeNull();
    expect(parseCanvasColor("rgb(a b c)")).toBeNull();
  });
});

describe("canvasRgba", () => {
  it("builds the string a canvas stroke wants, with an overridable alpha", () => {
    const gold = { r: 245, g: 183, b: 61, a: 1 };
    expect(canvasRgba(gold)).toBe("rgba(245, 183, 61, 1)");
    expect(canvasRgba(gold, 0.05)).toBe("rgba(245, 183, 61, 0.05)");
    // A parsed `rgba()` token keeps its own alpha when none is passed.
    expect(canvasRgba(parseCanvasColor("rgba(4, 5, 8, 0.26)")!)).toBe("rgba(4, 5, 8, 0.26)");
  });
});

describe("mixCanvasColors", () => {
  it("interpolates unrounded, so the caller floors once exactly as the old inline ramps did", () => {
    const bronze = { r: 180, g: 80, b: 20, a: 1 };
    const gold = { r: 245, g: 183, b: 61, a: 1 };
    expect(mixCanvasColors(bronze, gold, 0)).toEqual(bronze);
    expect(mixCanvasColors(bronze, gold, 1)).toEqual(gold);
    // `Math.floor(180 + 0.5 * 65)` is the waterfall's old arithmetic — it must still be 212.
    expect(Math.floor(mixCanvasColors(bronze, gold, 0.5).r)).toBe(212);
  });
});

describe("resolveCanvasColor", () => {
  it("prefers the skin's token and falls back to the desktop literal", () => {
    expect(resolveCanvasColor("#00ff00", "#f5b73d")).toEqual({ r: 0, g: 255, b: 0, a: 1 });
    expect(resolveCanvasColor("", "#f5b73d")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    expect(resolveCanvasColor("var(--m-gold)", "#f5b73d")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
    expect(resolveCanvasColor("not-a-colour", "#f5b73d")).toEqual({ r: 245, g: 183, b: 61, a: 1 });
  });
});

/** A 2D context stub that records every style written to it. */
function recordingContext() {
  const strokes: string[] = [];
  const fills: string[] = [];
  const plane: Record<string, unknown> = {
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 1,
    font: "",
    shadowBlur: 0,
    shadowColor: "",
    setLineDash: vi.fn(),
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
  };
  const ctx = new Proxy(plane, {
    set(target, prop, value) {
      if (prop === "strokeStyle") strokes.push(String(value));
      if (prop === "fillStyle") fills.push(String(value));
      target[prop as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, strokes, fills };
}

describe("a skin's colour reaches the kick canvas", () => {
  let recording: ReturnType<typeof recordingContext>;

  beforeEach(() => {
    recording = recordingContext();
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => recording.ctx
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    document.documentElement.removeAttribute("data-skin");
  });

  it("paints the beam, graticule and ground from .mobile-root when a skin is active", () => {
    render(
      <div
        className="mobile-root"
        data-testid="skin-root"
        style={
          {
            "--m-gold": "#00ff00",
            "--m-bg": "#101010",
            "--m-ink-3": "#202020",
          } as React.CSSProperties
        }
      >
        <PhosphorOscilloscope analyser={null} plv={0.5} lastHitTime={0} />
      </div>
    );

    // The steady beam is the accent the skin declared...
    expect(recording.strokes).toContain("rgba(0, 255, 0, 1)");
    // ...and the graticule is the skin's dim ink, not the desktop's white.
    expect(recording.strokes).toContain("rgba(32, 32, 32, 0.05)");
    // The phosphor decays onto the skin's ground.
    expect(recording.fills).toContain("rgba(16, 16, 16, 1)");
    expect(recording.fills).toContain("rgba(16, 16, 16, 0.26)");
    // Nothing amber survived the re-skin.
    expect([...recording.strokes, ...recording.fills].some((s) => s.includes("245, 183, 61"))).toBe(
      false
    );
  });

  it("is pixel-identical on the desktop: with no .mobile-root every colour is today's literal", () => {
    render(<PhosphorOscilloscope analyser={null} plv={0.5} lastHitTime={0} />);

    expect(recording.strokes).toContain("rgba(245, 183, 61, 1)"); // the amber beam
    expect(recording.strokes).toContain("rgba(255, 255, 255, 0.05)"); // the idle graticule
    expect(recording.fills).toContain("rgba(4, 5, 8, 1)"); // the pre-fill
    expect(recording.fills).toContain("rgba(4, 5, 8, 0.26)"); // the persistence sweep
  });

  it("re-resolves on a data-skin change without a re-render and without a per-frame read", async () => {
    render(
      <div
        className="mobile-root"
        data-testid="skin-root"
        style={{ "--m-gold": "#00ff00", "--m-bg": "#101010" } as React.CSSProperties}
      >
        <PhosphorOscilloscope analyser={null} plv={0.5} lastHitTime={0} />
      </div>
    );
    expect(recording.strokes).toContain("rgba(0, 255, 0, 1)");

    const root = screen.getByTestId("skin-root");
    root.style.setProperty("--m-gold", "#ff00ff");
    document.documentElement.setAttribute("data-skin", "pixel");

    // The observer re-resolves on a microtask; the running rAF loop picks the new palette up on its
    // next frame, so the assertion has to give it one.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
    });
    expect(recording.strokes).toContain("rgba(255, 0, 255, 1)");
  });
});

/**
 * The hook's own contract, without a painter in the way: with a `.mobile-root` above the canvas it
 * resolves the skin's token, and with none it keeps the desktop fallback. This is what lets each
 * visualiser call the hook before its drawing effect and know the first frame is the right colour.
 */
describe("useCanvasPalette", () => {
  function Harness({
    fallbacks,
    skinned,
  }: {
    fallbacks: CanvasPaletteFallbacks;
    skinned: boolean;
  }) {
    const ref = useRef<HTMLCanvasElement | null>(null);
    const palette = useCanvasPalette(ref, fallbacks);
    const [signal, setSignal] = useState("");
    useEffect(() => {
      setSignal(canvasRgba(palette.current.signal));
    }, [palette]);
    const canvas = <canvas ref={ref} data-testid="harness-canvas" />;
    const readout = <span data-testid="harness-signal">{signal}</span>;
    return skinned ? (
      <div className="mobile-root" style={{ "--m-gold": "#123456" } as React.CSSProperties}>
        {canvas}
        {readout}
      </div>
    ) : (
      <div>
        {canvas}
        {readout}
      </div>
    );
  }

  it("resolves the skin's token from the nearest .mobile-root", () => {
    render(<Harness fallbacks={DESKTOP_CANVAS_FALLBACKS} skinned />);
    expect(screen.getByTestId("harness-signal").textContent).toBe("rgba(18, 52, 86, 1)");
  });

  it("keeps the desktop literal when there is no .mobile-root", () => {
    render(<Harness fallbacks={DESKTOP_CANVAS_FALLBACKS} skinned={false} />);
    expect(screen.getByTestId("harness-signal").textContent).toBe("rgba(245, 183, 61, 1)");
  });
});
