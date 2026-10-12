/**
 * 🚀 **The app's own Quick Start must answer "how do I run this myself".**
 *
 * The owner's request (2026-10-05) covers both surfaces: the README and the help centre inside the app, each
 * carrying requirements and build/run commands in a prominent place. The README half is pinned next door in
 * `readmeQuickStart.test.ts`; this pins the in-app half, which lives in the `quickstart` tab of the help
 * centre. It checks the answers rather than the wording, and that both languages are present, because a
 * developer reading the Chinese UI should not have to switch to English for the commands.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = "src/components/help/HelpCenterModal.tsx";
const CARD = "src/components/help/QuickStartRunItYourselfCard.tsx";
const REQUIRED = ["22.22.2", "npm install", "npm run dev", "npm run build", "npm run preview"];
const BILINGUAL = ["Requirements", "环境要求"];

/** The quickstart branch of the help centre, from its opening to the next tab's branch. */
function quickStartBranch(): string {
  const text = readFileSync(SOURCE, "utf8");
  const start = text.indexOf('activeCategory === "quickstart"');
  if (start < 0) return "";
  const rest = text.slice(start);
  const next = rest.indexOf("activeCategory ===", 10);
  const branch = next < 0 ? rest : rest.slice(0, next);
  return branch + readFileSync(CARD, "utf8");
}

describe("the in-app Quick Start carries the requirements and the commands", () => {
  it("⭐ names the Node requirement and every build/run command", () => {
    const branch = quickStartBranch();
    expect(REQUIRED.filter((needle) => !branch.includes(needle))).toEqual([]);
  });

  it("⭐ says it in both languages, not only English", () => {
    const branch = quickStartBranch();
    expect(BILINGUAL.filter((needle) => !branch.includes(needle))).toEqual([]);
  });

  it("⭐ still measures, so a moved section cannot pass quietly", () => {
    const branch = quickStartBranch();
    expect({ found: branch.length > 0, sizeable: branch.length > 2000 })
      .toEqual({ found: true, sizeable: true });
  });
});
