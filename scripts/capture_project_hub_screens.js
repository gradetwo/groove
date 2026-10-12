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
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "zh-CN",
    });
    const page = await context.newPage();

    console.log("Navigating to Studio...");
    await page.goto(`${baseUrl}/#/studio?genre=chicago-house`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 1. Open Export Dropdown to show .groove export
    console.log("Opening Export dropdown...");
    const exportBtn = await page.locator("button[aria-haspopup='true']").first();
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "project_hub_01_export_dropdown.png"),
      });
      console.log("Captured project_hub_01_export_dropdown.png");
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
    }

    // 2. Open Project Hub Modal
    console.log("Opening Project Hub Modal...");
    const projectBtn = await page.locator("button[aria-label='工程管理中心'], button[title*='工程管理中心']").first();
    if (await projectBtn.isVisible()) {
      await projectBtn.click();
    } else {
      await page.keyboard.press("p");
    }

    await page.waitForTimeout(800);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "project_hub_02_modal_open.png"),
    });
    console.log("Captured project_hub_02_modal_open.png");

    // 3. Click "另存为新工程"
    console.log("Opening Save As Subdialog...");
    const saveAsBtn = await page.locator("button[title*='另存为'], button:has-text('另存为')").first();
    if (await saveAsBtn.isVisible()) {
      await saveAsBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "project_hub_03_save_as_modal.png"),
      });
      console.log("Captured project_hub_03_save_as_modal.png");

      // Click "确认保存"
      const confirmBtn = await page.locator("button:has-text('确认保存')").first();
      await confirmBtn.click();
      await page.waitForTimeout(800);

      // Capture populated project cards grid
      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "project_hub_04_populated_grid.png"),
      });
      console.log("Captured project_hub_04_populated_grid.png");

      // Close modal
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);

      // Open Export dropdown on Toolbar
      const toolbarExportBtn = await page.locator("button:has-text('导出')").first();
      await toolbarExportBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({
        path: path.join(ARTIFACT_DIR, "project_hub_05_export_groove_dropdown.png"),
      });
      console.log("Captured project_hub_05_export_groove_dropdown.png");
    }

    console.log("All screenshots captured successfully!");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Error capturing screenshots:", err);
  process.exit(1);
});
