#!/usr/bin/env node
/**
 * Components that must use the application's styling — the check that was missing when `/new` shipped as a wall of unstyled text.
 *
 * Three existing checks were green while the screen was unreadable, and each was answering a different question: `check:css` looks for **dead** rules (the opposite direction), the unit criteria test structure and
 * behaviour rather than appearance, and the boot probe only asks whether the app starts — it started, it just looked like that.
 *
 * So this asks the question none of them asked: **does this component use the app's styling at all?** It is deliberately a list rather than a glob, because the honest scope is "the new interface, from now on": every
 * file named here has been styled, and adding a component to the list is how a new one opts in. A repo-wide sweep would fail on a decade of components that predate the rule, and a check that fails on day one is a
 * check that gets switched off.
 */
import fs from "node:fs";
import path from "node:path";

/** The files this rule applies to. Add a component when it is written, not when it is noticed. */
const REQUIRED = [
  "src/components/arrangement/ArrangementViewV2.tsx",
  "src/components/arrangement/TrackListV2.tsx",
  "src/components/arrangement/TakeSelectorV2.tsx",
  "src/components/arrangement/RecordButtonV2.tsx",
  "src/components/arrangement/NewProjectPanelV2.tsx",
];

/** A `className` with Tailwind utilities or a `--d-*` token. The token form is what makes a skin change reach the component. */
const STYLED = /className=[^>]*?["'`][^"'`]*(?:[a-z-]+-\[|text-|flex|grid|gap-|p[xy]?-|m[xy]?-|rounded|border|bg-|w-|h-|opacity-)/;

let failed = 0;
const report = [];

for (const file of REQUIRED) {
  const full = path.join(process.cwd(), file);
  if (!fs.existsSync(full)) {
    report.push(`❌ ${file}: named here but missing — either write it or remove it from the list`);
    failed += 1;
    continue;
  }
  const source = fs.readFileSync(full, "utf8");
  // The file must style its own markup, not merely import something that does.
  if (!STYLED.test(source)) {
    report.push(`❌ ${file}: uses no styling — the app is drawn with utility classes and --d-* tokens, and a component without them renders as plain text`);
    failed += 1;
  }
}

if (failed > 0) {
  console.error(report.join("\n"));
  console.error(`\n${failed} component(s) without styling. This is the check that would have caught the unstyled /new page.`);
  process.exit(1);
}
console.log(`✅ ${REQUIRED.length} component(s) use the application's styling.`);
