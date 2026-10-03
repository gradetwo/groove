/**
 * **Does the built app know where the sample bytes are?**
 *
 * ## Why this exists
 *
 * The 2.34.38 release shipped a bundle whose catalogue root was empty: the release tree had no local env file, so
 * `VITE_SAMPLE_ROOT` was unset when Vite inlined it, and the app came up with a manifest it could read and not one
 * recording it could fetch. Nothing in the nine release steps noticed — the version matched, the covers payload was
 * right, the boot probe passed, the remote matrix was green — because every one of those checks is about the *build
 * being coherent*, and this defect is about the build being **incomplete**. It was found by fetching the deployed
 * JavaScript and looking for the mirror host.
 *
 * ## ⚠️ Why it reads every built file rather than the entry chunks
 *
 * The first attempt at that check looked at the scripts `index.html` names, found no root, and reported the live site
 * as broken — while it was fine. The root lives in a lazy chunk (`arrangementStore-*.js`), because only the store that
 * builds sample URLs needs it. **A guard that repeats that mistake would block a correct release**, so this one reads
 * every `.js` under the output directory, and the criterion beside it pins that behaviour.
 *
 * ## The rule
 *
 * * A root in the environment (or the build's local env file) must be present in the built JavaScript.
 * * With no root configured, the app is only sound if the shipped manifest carries absolute addresses of its own —
 *   if it does not, the bytes are unreachable and the build is refused **before** anything is uploaded.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/** Every `.js` under a directory, recursively — the chunks, not just the ones the entry point names. */
export function builtScripts(dir) {
  const found = [];
  const walk = (current) => {
    let entries;
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(current, entry);
      let stat;
      try {
        stat = statSync(full);
      } catch {
        continue;
      }
      if (stat.isDirectory()) walk(full);
      else if (entry.endsWith(".js")) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/** Whether a manifest describes bytes that live at absolute addresses, in which case no root is needed. */
export function manifestCarriesAbsoluteUrls(manifestText) {
  return /"(?:path|url)"\s*:\s*"https?:\/\//i.test(manifestText ?? "");
}

/**
 * The verdict, as data rather than as a process exit, so a criterion can drive it with a fixture.
 *
 * @param {{distDir: string, envRoot?: string, manifestText?: string}} input
 * @returns {{ok: boolean, reason?: string, scriptsRead?: number}}
 */
export function sampleRootVerdict({ distDir, envRoot, manifestText }) {
  const scripts = builtScripts(distDir);
  const root = (envRoot ?? "").trim();
  if (root !== "") {
    for (const file of scripts) {
      let text = "";
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      if (text.includes(root)) return { ok: true, scriptsRead: scripts.length };
    }
    return {
      ok: false,
      scriptsRead: scripts.length,
      reason:
        `the built app does not contain the configured sample root (${root}), so it cannot fetch any recording.\n` +
        "   The build is made from the tree it runs in: check that the local env file with VITE_SAMPLE_ROOT is present\n" +
        "   before building (it is gitignored, so a fresh worktree never has one)."
    };
  }
  if (manifestCarriesAbsoluteUrls(manifestText)) return { ok: true, scriptsRead: scripts.length };
  return {
    ok: false,
    scriptsRead: scripts.length,
    reason:
      "no sample root is configured and the shipped manifest carries no absolute addresses, so the app could read its\n" +
      "   catalogue and fetch nothing. Set VITE_SAMPLE_ROOT (gitignored .env.local) and build again."
  };
}
