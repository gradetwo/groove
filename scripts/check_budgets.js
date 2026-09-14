import fs from "fs";
import path from "path";
import zlib from "zlib";

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
   */
  initialRouteGzipKb: 220,
};

function getGzipSizeKb(filePath) {
  const buf = fs.readFileSync(filePath);
  const gz = zlib.gzipSync(buf);
  return gz.length / 1024;
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
