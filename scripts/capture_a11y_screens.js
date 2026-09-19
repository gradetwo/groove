import http from "http";
import fs from "fs";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  // Optional escape hatch for machines where Playwright lives elsewhere; it is a
  // regular devDependency now, so the normal resolve above is the expected path.
  const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
  if (!modulePath) {
    throw new Error("Playwright not found. Run `npm install`, or set PLAYWRIGHT_MODULE_PATH.");
  }
  playwright = createRequire(`${modulePath}/noop.js`)("playwright");
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function startStaticServer() {
  return new Promise((resolve) => {
    const distDir = path.join(process.cwd(), "dist");
    const server = http.createServer((req, res) => {
      let relativePath = req.url.split("?")[0];
      if (relativePath === "/") relativePath = "/index.html";
      let filePath = path.join(distDir, relativePath);

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distDir, "index.html");
      }

      const ext = path.extname(filePath);
      res.writeHead(200, {
        "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

const ARTIFACT_DIR = "/home/crow/.gemini/antigravity-cli/brain/7a53e9f6-094e-4492-981c-bb139b522710";

async function main() {
  const { server, port } = await startStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await playwright.chromium.launch({ headless: true });

  try {
    // 1. Desktop - Shortcuts Modal
    console.log("Capturing Shortcuts Modal Desktop...");
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    const desktopPage = await desktopContext.newPage();
    await desktopPage.goto(baseUrl, { waitUntil: "networkidle" });
    await desktopPage.waitForTimeout(1000);

    // Press '?' to trigger shortcuts modal
    await desktopPage.keyboard.press("?");
    await desktopPage.waitForTimeout(500);
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, "shortcuts_modal_desktop.png"),
      fullPage: false,
    });

    // Close modal with Escape
    await desktopPage.keyboard.press("Escape");
    await desktopPage.waitForTimeout(400);

    // 2. Desktop - Studio with Step Cell Focus Ring
    console.log("Capturing Studio Desktop A11y...");
    const stepCell = await desktopPage.$('[role="gridcell"]');
    if (stepCell) {
      await stepCell.focus();
      await desktopPage.waitForTimeout(300);
    }
    await desktopPage.screenshot({
      path: path.join(ARTIFACT_DIR, "studio_desktop_a11y.png"),
      fullPage: false,
    });
    await desktopContext.close();

    // 3. iPhone 14 Portrait
    console.log("Capturing iPhone 14 Portrait...");
    const iphonePortraitCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const iphonePortraitPage = await iphonePortraitCtx.newPage();
    await iphonePortraitPage.goto(baseUrl, { waitUntil: "networkidle" });
    await iphonePortraitPage.waitForTimeout(1000);
    await iphonePortraitPage.screenshot({
      path: path.join(ARTIFACT_DIR, "studio_iphone14_portrait_a11y.png"),
      fullPage: false,
    });
    await iphonePortraitCtx.close();

    // 4. iPhone 14 Landscape
    console.log("Capturing iPhone 14 Landscape...");
    const iphoneLandscapeCtx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15",
      isMobile: true,
      hasTouch: true,
      locale: "zh-CN",
    });
    const iphoneLandscapePage = await iphoneLandscapeCtx.newPage();
    await iphoneLandscapePage.goto(baseUrl, { waitUntil: "networkidle" });
    await iphoneLandscapePage.waitForTimeout(1000);
    await iphoneLandscapePage.screenshot({
      path: path.join(ARTIFACT_DIR, "studio_iphone14_landscape_a11y.png"),
      fullPage: false,
    });
    await iphoneLandscapeCtx.close();

    console.log("Screenshots successfully captured!");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Screenshot capture failed:", err);
  process.exit(1);
});
