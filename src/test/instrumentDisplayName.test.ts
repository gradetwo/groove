import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { instrumentDisplayName } from "../components/arrangement/instrumentDisplayName";

/**
 * ⭐ **The chip names the instrument, not its library** (owner's instruction, 2026-10-09: "只显示乐器名"), which is also
 * what the chip's own comment has claimed since it was written. The catalogue joins the two with a spaced em dash.
 */
describe("the instrument's display name", () => {
  it("⭐ drops the library prefix the catalogue writes before a spaced em dash", () => {
    expect(instrumentDisplayName("Virtuosity Drums — Basic Kit")).toBe("Basic Kit");
    expect(instrumentDisplayName("Salamander Grand — Piano")).toBe("Piano");
  });

  it("⭐ leaves a name alone when it carries neither a library prefix nor a term that was checked", () => {
    expect(instrumentDisplayName("Salamander Grand Piano")).toBe("Salamander Grand Piano");
    expect(instrumentDisplayName("emily chords wide")).toBe("Emily chords wide");
  });

  it("⭐ translates only the library's terms that its own data proves", () => {
    expect(instrumentDisplayName("arco 3vel")).toBe("Bowed 3 layers");
    expect(instrumentDisplayName("pizz three")).toBe("Plucked three");
    expect(instrumentDisplayName("arco modwheel")).toBe("Bowed mod wheel");
    expect(instrumentDisplayName("arco mw basic map")).toBe("Bowed mod wheel basic · keyswitch map");
    expect(instrumentDisplayName("darkblack stac")).toBe("Darkblack staccato");
  });

  it("⭐ says a keyswitch map is one, instead of leaving a choice that makes no sound", () => {
    // Verified through the mirror: `arco_basic_map.sfz` is `<group> lokey=12 hikey=22` mapping that key range onto
    // articulations — a switcher, not an instrument.
    expect(instrumentDisplayName("arco basic map")).toBe("Bowed basic · keyswitch map");
    expect(instrumentDisplayName("arco looped six legato map")).toBe("Bowed looped six legato · keyswitch map");
  });

  it("⭐ leaves `three` and `six` as the library writes them, because their meaning is not in the data", () => {
    // Measured: `arco_six` is 660 regions over vl1…vl5; `pizz_three` is 576 over vl1…vl4 with rr1…rr4 — neither matches
    // "three"/"six". Renaming them would invent a meaning, which a name must never do.
    expect(instrumentDisplayName("arco six")).toBe("Bowed six");
    expect(instrumentDisplayName("arco looped six legato first map")).toBe("Bowed looped six legato first · keyswitch map");
    expect(instrumentDisplayName("Bowed basic")).toBe("Bowed basic");
  });

  it("keeps the whole name when the part after the separator is empty", () => {
    expect(instrumentDisplayName("Library — ")).toBe("Library —");
  });

  it("⭐ leaves a hyphen alone, because a hyphen is part of names like `Hi-Hat - Closed`", () => {
    expect(instrumentDisplayName("Hi-Hat - Closed")).toBe("Hi-Hat - Closed");
  });

  it("⭐ and the chip uses it, while the full name stays in the tooltip", () => {
    const browser = readFileSync(resolve(__dirname, "../components/arrangement/InstrumentBrowserV2.tsx"), "utf8");
    expect(browser, "the visible label is the instrument").toContain("instrumentDisplayName(current.name)");
    expect(browser, "and `title` still carries the catalogue's own name").toMatch(/title=\{current \? current\.name/);
  });
});
