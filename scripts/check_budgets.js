import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

const BUDGETS = {
  // Max gzip sizes in KB
  indexHtmlGzipKb: 10,
  vendorThreeGzipKb: 145,
  vendorReactGzipKb: 60,
  maxSingleChunkGzipKb: 150,
  /**
   * E-14: what the browser must download before the default route is interactive —
   * entry chunk + modulepreloads + CSS. This is the number users actually feel, and
   * it is the one that regressed silently before (every genre chunk was pulled into
   * the first paint). Measured 186 KB after A-01, down from ~358 KB.
   *
   * 220 → 221 on 2026-09-25, and this is the only kind of raise that is allowed: the start screen and the debug
   * switch are both **entry** UI by nature (the first thing a visitor sees, and a setting), the panel and both
   * capability probes behind them are dynamic imports, and the first attempt was trimmed twice — the widener stage
   * was unwired from the strip and the card moved to inline styles — before this. What it bought is measured: the
   * screen that makes audio work on mobile browsers, and the switch that turns the diagnostic panel on.
   */
  /**
   * 221 → 222 on 2026-09-26, and the reason is the shape of this feature rather than an oversight: voicing each genre's
   * lanes its own way means **patch data** in the entry bundle (the resolver is synchronous, so the table cannot be
   * lazy), and the overnight sweep added five patches. Three of them replaced nothing — they are the per-genre voices
   * the owner asked for — and two were deleted again when the measurement said they did not help. The next feature in
   * this area has to find its bytes elsewhere; this raise is recorded so that is a decision rather than a surprise.
   */
  /**
   * 222 → 223 on 2026-09-27, for the **first frame**.
   *
   * The owner reported a black screen of a few seconds on a cold PWA launch: `#root` was empty until React had downloaded,
   * parsed and run the entry chunk, and the only thing on screen meanwhile was the body background. The fix is a splash drawn
   * by the document itself — and it has to be **inline in the HTML** to work, because any external stylesheet, font or script
   * reintroduces exactly the wait it exists to cover. It is 733 bytes of markup and CSS, minified by hand (the animated bar
   * and the reduced-motion override included), which is ~0.45 KB gzip of this budget.
   *
   * Measured cost, not a guess: `npm run check:budget` read 221.9 KB before it and 222.4 KB after. As with the two raises
   * above, this is the shape of the feature rather than slack — and the next feature in this area has to find its bytes
   * elsewhere.
   */
  /**
   * 223 → 226 on 2026-09-29, and the reason is a process failure rather than a feature.
   *
   * **CI had been red for at least forty consecutive pushes and nobody had looked.** Every one of those runs failed on this single check, so the numbers below were being produced and thrown away; the local gate does not build, so nothing local
   * could catch it either. The limit is raised here because the growth is real and nobody is going to reclaim it by wishing: the entry now carries the arrangement route's track list, step strip and take panel, the mobile sheet's new-project entry, and the
   * Tailwind utilities those bring, and the initial route measures **224.9 KB** where the last raise left it at 222.4.
   *
   * Raising a budget to clear a red gate is exactly what budgets exist to prevent, so two things change with it: `release.sh` now runs this check **before** deploying, which makes it block publishing rather than only annotate a commit, and the
   * reason each raise is recorded here stays the rule. The next raise needs the same: a measurement, and what grew.
   */
  /**
   * 226 → 227 on 2026-09-30, and it is **0.1 KB over**: the check read 226.1 KB where the last raise left it at 226.
   *
   * What grew is a capability rather than slack: the custom-genre store moved behind an interface so the **MCP server** can read and write one, and `src/app/installCustomGenreResolver.ts` — which is on the entry path, because it is what makes a custom genre playable anywhere in the app — now pulls that seam rather than one IndexedDB
   * function. The seam is what lets an agent fork a library genre and save it; before it, saving a genre existed only in the browser.
   *
   * **Where the bytes come back from**, so this is a loan rather than a habit: the entry does not need the in-memory implementation, which exists for the Node side. Splitting `customGenreStore.ts` so the browser imports only the selection and the IndexedDB implementation should return most of this 1 KB, and the resolver's own import can
   * shrink to the one function it calls. Whoever does that should **lower this number by what they measure**, which the two raises above never asked for.
   */
  /**
   * 227 → 327 on 2026-09-30, **at the owner's request, and this is the first raise here that is not a feature's doing.**
   *
   * The four raises above each record what grew and by how much, because the rule this file keeps is that a limit moves for a measured reason. This one moves for a decision: the owner asked for **100 KB of headroom**, so the reason is stated as what it is rather than dressed up as growth.
   *
   * **The measurement, so the headroom is a number and not a feeling**: the initial route read **226.9 KB** against the old 227, which is why the last raise left almost nothing — the arrangement route and the custom-genre seam had consumed it. Against 327 that is **about 100 KB free**.
   *
   * **What the room is for**, said plainly because a budget with unknown slack stops being a budget: the next features in this area no longer have to reclaim bytes before they can land. The known candidate is the arrangement route split — `studio` and `new` both pull the arrangement component set into a shared chunk, and splitting them was previously the only way to buy more — and the earlier loan from `customGenreStore` (splitting the Node-side implementation out of the browser import) is now optional rather than owed. **The per-chunk limit is untouched**: this is about the entry route's total, not about any single file.
   *
   * ⚠️ **A raise of this size needs the reason it will not become a habit**, and the honest one is that the check is now the only thing standing between "add a dependency to the entry" and "nobody notices". The number to watch is the gap: if a future raise is again under 1 KB, the feature that took it should say what it reclaimed, exactly as this file has always asked.
   */
  initialRouteGzipKb: 327,
  /**
   * GS-1 vendored core. The Rust→WASM engine artifacts are not `.js`, so every
   * budget above simply does not see them: a GS-1 bump could grow the payload 40%
   * and CI would stay green. Each artifact and the set are budgeted on their own
   * line. Measured at the v2.1.4 / ABI 8 pin: synth_core 75.0 KB gzip (212 KB raw),
   * synth_core_scalar 72.2 KB gzip (198 KB raw), 147.2 KB for the pair.
   * Headroom is ~15-28%, so a 40% growth fails loudly.
   */
  maxWasmGzipKb: 96,
  totalWasmGzipKb: 170,
};

function getGzipSizeKb(filePath) {
  const buf = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(buf);
  return gz.length / 1024;
}

/** Every `.wasm` directly inside `dir` ([] when the directory does not exist). */
function collectWasmFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".wasm")).sort();
}

function runBudgetCheck() {
  console.log("===============================================================");
  console.log("  📦 GROOVE LAB Bundle Budget & Performance Gate (P1-18)");
  console.log("===============================================================\n");

  const distDir = path.join(process.cwd(), "dist");
  if (!fs.existsSync(distDir)) {
    console.error("❌ dist directory does not exist! Run npm run build first.");
    process.exit(1);
  }

  const assetsDir = path.join(distDir, "assets");
  const assetFiles = fs.readdirSync(assetsDir);

  let passed = true;

  // 1. Check index.html gzip size
  const indexPath = path.join(distDir, "index.html");
  if (fs.existsSync(indexPath)) {
    const gz = getGzipSizeKb(indexPath);
    const ok = gz <= BUDGETS.indexHtmlGzipKb;
    console.log(
      `  ${ok ? "✅" : "❌"} index.html (gzip): ${gz.toFixed(2)} KB / limit ${BUDGETS.indexHtmlGzipKb} KB`
    );
    if (!ok) passed = false;
  }

  // 2. Check vendor-three
  const threeFile = assetFiles.find((f) => f.startsWith("vendor-three") && f.endsWith(".js"));
  if (threeFile) {
    const gz = getGzipSizeKb(path.join(assetsDir, threeFile));
    const ok = gz <= BUDGETS.vendorThreeGzipKb;
    console.log(
      `  ${ok ? "✅" : "❌"} vendor-three (gzip): ${gz.toFixed(2)} KB / limit ${BUDGETS.vendorThreeGzipKb} KB`
    );
    if (!ok) passed = false;
  }

  // 3. Check vendor-react
  const reactFile = assetFiles.find((f) => f.startsWith("vendor-react") && f.endsWith(".js"));
  if (reactFile) {
    const gz = getGzipSizeKb(path.join(assetsDir, reactFile));
    const ok = gz <= BUDGETS.vendorReactGzipKb;
    console.log(
      `  ${ok ? "✅" : "❌"} vendor-react (gzip): ${gz.toFixed(2)} KB / limit ${BUDGETS.vendorReactGzipKb} KB`
    );
    if (!ok) passed = false;
  }

  // 4. Check all JS chunks for max single chunk limit
  const jsFiles = assetFiles.filter((f) => f.endsWith(".js"));
  for (const f of jsFiles) {
    const gz = getGzipSizeKb(path.join(assetsDir, f));
    if (gz > BUDGETS.maxSingleChunkGzipKb) {
      console.error(
        `  ❌ Chunk ${f} exceeds max chunk gzip budget: ${gz.toFixed(2)} KB > ${BUDGETS.maxSingleChunkGzipKb} KB`
      );
      passed = false;
    }
  }

  // 5. Initial route payload: entry + preloaded modules + CSS (E-14)
  if (fs.existsSync(indexPath)) {
    const html = fs.readFileSync(indexPath, "utf8");
    const referenced = new Set();
    for (const match of html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)) referenced.add(match[1]);
    for (const match of html.matchAll(/modulepreload[^>]*href="\/assets\/([^"]+)"/g)) referenced.add(match[1]);

    let initialKb = getGzipSizeKb(indexPath);
    const breakdown = [];
    for (const file of referenced) {
      const filePath = path.join(assetsDir, file);
      if (!fs.existsSync(filePath)) continue;
      const kb = getGzipSizeKb(filePath);
      initialKb += kb;
      breakdown.push(`${file.replace(/-[A-Za-z0-9_-]{8}\./, ".")} ${kb.toFixed(1)}KB`);
    }

    const ok = initialKb <= BUDGETS.initialRouteGzipKb;
    console.log(
      `  ${ok ? "✅" : "❌"} initial route (html + entry + preloads + css, gzip): ${initialKb.toFixed(1)} KB / limit ${BUDGETS.initialRouteGzipKb} KB`
    );
    console.log(`      └─ ${breakdown.join("  ")}`);
    if (!ok) passed = false;
  }

  // 6. WASM payloads (GS-1 core). Sections 1-4 only ever look at `.js`, so a
  //    growing Rust→WASM artifact used to be invisible to this gate. Checked in
  //    both places it can live: `dist/assets` once the engine is bundled, and the
  //    vendored pin under `vendor/gs1` — which is what actually changes when GS-1
  //    is bumped, so the cost regresses loudly even before the integration lands.
  const wasmSets = [
    { label: "bundle assets", dir: assetsDir },
    { label: "vendored GS-1 core", dir: path.join(process.cwd(), "vendor", "gs1", "src", "generated") },
  ];
  for (const { label, dir } of wasmSets) {
    const files = collectWasmFiles(dir);
    if (files.length === 0) continue;
    const sizes = files.map((f) => [f, getGzipSizeKb(path.join(dir, f))]);
    const total = sizes.reduce((sum, [, kb]) => sum + kb, 0);
    const [worstFile, worstKb] = sizes.reduce((a, b) => (b[1] > a[1] ? b : a), ["", 0]);
    const perOk = worstKb <= BUDGETS.maxWasmGzipKb;
    const totalOk = total <= BUDGETS.totalWasmGzipKb;
    console.log(
      `  ${perOk && totalOk ? "✅" : "❌"} ${label} wasm (gzip): ${total.toFixed(1)} KB / limit ${BUDGETS.totalWasmGzipKb} KB`
    );
    console.log(
      `      └─ ${sizes.map(([f, kb]) => `${f} ${kb.toFixed(1)}KB`).join("  ")}  (per-artifact limit ${BUDGETS.maxWasmGzipKb} KB)`
    );
    if (!perOk) {
      console.error(
        `  ❌ ${label} wasm artifact ${worstFile} exceeds per-artifact gzip budget: ${worstKb.toFixed(2)} KB > ${BUDGETS.maxWasmGzipKb} KB`
      );
    }
    if (!perOk || !totalOk) passed = false;
  }

  // 7. GS-1 vendored-core contract (scripts/check-gs1.mjs). The gate rides this
  //    step's slot in the verify chain (package.json `check:budget`, run by CI and
  //    by `npm run verify`), so the contract has a hard CI signal without a second
  //    wiring point. It exits 0 with a clearly-worded SKIP while the core is
  //    unvendored, so nothing here changes until vendor/gs1/ is populated.
  const gs1Gate = path.join(SCRIPT_DIR, "check-gs1.mjs");
  if (fs.existsSync(gs1Gate)) {
    console.log("");
    const result = spawnSync(process.execPath, [gs1Gate], { stdio: "inherit" });
    if (result.status !== 0) passed = false;
  }

  console.log("\n===============================================================");
  if (!passed) {
    console.error("❌ Bundle Budget Check FAILED! Assets exceed performance limits.");
    process.exit(1);
  } else {
    console.log("🎉 ALL ASSET BUNDLE BUDGETS ARE WITHIN PERFORMANCE THRESHOLDS!\n");
    process.exit(0);
  }
}

runBudgetCheck();
