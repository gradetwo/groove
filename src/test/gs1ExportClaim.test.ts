import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * ⭐ **User-facing copy must not promise an export that does not exist.**
 *
 * The help text claimed a creator could "export directly as a GS1 patch" (and, elsewhere, "export GS1 patch
 * bundles"). No such export exists anywhere in the tree: GS-1 appears only as patch storage and resolution —
 * `Gs1VoicePool`, `gs1ParamOverrides`, `gs1Tracks`, and the lane resolution in `WavExporter` — and there is no
 * bundle writer. `docs/GS1_PATCH_SURFACE.md` had recorded this as an unfixed false claim ("旧文 §5 的假声明（仍在，未改）"),
 * alongside the export menu having no seventh item.
 *
 * This project's own standard is that a document which tells you to do the wrong thing is worse than no document,
 * and this text is in front of a creator. So the claim is gone, and the criterion holds both halves: the promise
 * cannot come back, and the part that was true was not thrown away with it.
 */
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), "utf8");

const COPY_FILES = [
  "src/i18n/locales/help.ts",
  "src/data/tutorialCourses.ts",
  "src/components/help/HelpCenterModal.tsx",
];

describe("the GS-1 export claim in the help copy", () => {
  it("⭐ promises no GS-1 patch export, in either wording it used", () => {
    for (const file of COPY_FILES) {
      const source = read(file);
      expect(source, `${file} must not claim a GS-1 patch export`).not.toMatch(/as a GS1 patch/i);
      expect(source, `${file} must not claim GS-1 patch bundles`).not.toMatch(/GS1 patch bundles/i);
      // The Chinese wording made the same promise ("一键导出为 GS1 开放协议补丁").
      expect(source, `${file} must not claim a GS-1 patch export in Chinese`).not.toMatch(/导出为 GS1/);
    }
  });

  it("⭐ keeps the half that was true, so the fix was not a deletion", () => {
    // Ableton export genuinely exists (`src/audio/AbletonExporter.ts`), as does URL sharing, so the sentence must
    // still say so rather than being emptied out to make the criterion pass.
    expect(read("src/i18n/locales/help.ts")).toMatch(/Ableton/);
    expect(read("src/audio/AbletonExporter.ts").length).toBeGreaterThan(0);
  });

  it("and the thing it used to promise still has no implementation, which is why the copy had to change", () => {
    // If someone builds a bundle export later, this case is the reminder that the copy may then be true again —
    // it fails, and the person adding the feature is the person who should reword the text.
    const candidates = [
      "src/audio/Gs1BundleExport.ts",
      "src/data/gs1Bundle.ts",
      "mcp/gs1Bundle.ts",
    ];
    const existing = candidates.filter((path) => {
      try {
        read(path);
        return true;
      } catch {
        return false;
      }
    });
    expect(existing, "no GS-1 bundle writer exists, so the copy must not claim one").toEqual([]);
  });
});
