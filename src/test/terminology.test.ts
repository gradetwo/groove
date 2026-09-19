/**
 * U9 · one name per concept (the words the user chose).
 *
 * The complaint was not that a translation was wrong but that the same three things had four or five
 * names each, so the tutorial said one and the interface showed another:
 *
 *   工作室   → 工作台      律动工作台 / 编曲工作台 / 编曲台 / 编曲室
 *   星系     → 律动星系    星系云团 / 星系图谱 / 曲风星谱 / 宇宙星图
 *   音符时长 → 音长        门限时值 / 门限 / 长度 / 时长
 *
 * Two halves, because either alone would rot:
 *
 *  - the **retired names** are scanned for, so a new string that reaches for one fails here;
 *  - the **canonical names** are asserted by key, so a "rename" that picks a *third* word also fails.
 *
 * What is deliberately not banned: 门限混响 (gated reverb — its own term, all over the genre data),
 * 长度 where it means a track's loop or step length (polymeter), 物理长度 / 衰减长度, and a genre's
 * 工作室 as an origin *place* ("personal music studio") rather than the app's studio view.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DICTIONARY } from "../i18n/locales";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(TEST_DIR, "..");

/** Names that must not appear anywhere in the interface copy any more. */
export const RETIRED = [
  "律动工作台",
  "编曲工作台",
  "编曲台",
  "编曲室",
  "星系云团",
  "星系图谱",
  "曲风星谱",
  "宇宙星图",
  "门限时值",
];

/**
 * `门限` on its own means the note's gate — but `门限混响` is gated reverb, a different thing that
 * the genre library legitimately uses. Match the gate sense only.
 */
const GATE_WORD = /门限(?!混响|军鼓|卡顿)/;

/** Files whose copy is part of the interface. Genre data and fixtures are out of scope on purpose. */
function interfaceSources(): string[] {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // The genre library's prose describes music, not the app, and its `origin_place` values are
        // places ("个人音乐工作室"); scanning it would produce noise, not findings.
        if (full.endsWith(`${path.sep}genres`)) continue;
        walk(full);
        continue;
      }
      if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
    }
  };
  for (const dir of ["i18n", "components", "views", "data", "features"]) {
    walk(path.join(SRC, dir));
  }
  return files;
}

/** Every retired name in a source, as `file:line  term`. */
export function retiredTermsIn(source: string, file: string): string[] {
  const found: string[] = [];
  source.split("\n").forEach((line, index) => {
    for (const term of RETIRED) {
      if (line.includes(term)) found.push(`${file}:${index + 1}  ${term}`);
    }
    if (GATE_WORD.test(line) && !/门限混响/.test(line)) {
      found.push(`${file}:${index + 1}  门限 (should be 音长)`);
    }
  });
  return found;
}

describe("U9 · the interface uses one name per concept", () => {
  it("keeps the names the user chose, by key", () => {
    const dict = DICTIONARY as Record<string, { en: string; zh: string }>;
    expect(dict.nav_studio.zh).toBe("工作台");
    expect(dict.nav_galaxy.zh).toBe("律动星系");
    expect(dict.roll_length.zh).toBe("音长");
    // The two places a *length* label could drift back to 长度 or 时长.
    expect(dict.roll_resize_hud.zh).toContain("音长");
    expect(dict.roll_quantize_lengths.zh).toContain("音长");
    // …and the note gate's label outside the roll.
    expect(dict.chords_arp_gate.zh).toContain("音长");
  });

  it("has no retired name left in the interface copy", () => {
    const offenders: string[] = [];
    for (const file of interfaceSources()) {
      const relative = `src/${path.relative(SRC, file).split(path.sep).join("/")}`;
      offenders.push(...retiredTermsIn(fs.readFileSync(file, "utf8"), relative));
    }
    expect(offenders, `retired terminology:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("still allows the words that mean something else", () => {
    // A scanner that cannot tell the two apart would have to be loosened until it checks nothing.
    expect(retiredTermsIn('zh: "短促门限混响军鼓"', "src/example.ts")).toEqual([]);
    expect(retiredTermsIn('zh: "将当前音轨循环长度展开至工程全长"', "src/example.ts")).toEqual([]);
    expect(retiredTermsIn('zh: "与门限混响无关的物理长度"', "src/example.ts")).toEqual([]);
    // …and it does fire on the retired ones (the guard is the point).
    expect(retiredTermsIn('zh: "返回编曲台"', "src/example.ts")).toEqual([
      "src/example.ts:1  编曲台",
    ]);
    expect(retiredTermsIn('zh: "门限: {gate} 步"', "src/example.ts")).toEqual([
      "src/example.ts:1  门限 (should be 音长)",
    ]);
  });
});
