/**
 * Serves `scratch/scroll-probe.html` on a fixed local port.
 *
 *   npm run probe:scroll      # then open http://127.0.0.1:4318 in macOS Chrome
 *
 * Why this exists: a two-finger trackpad scroll regression on macOS Chrome cannot be reproduced in
 * this environment. Headless Chromium on Linux delivers a synthetic wheel event exactly as expected —
 * the event reaches the element under the cursor, `defaultPrevented` is false, no handler cancels it,
 * the document is 1433 px tall in an 800 px viewport, and `window.scrollTo(0, 300)` moves it. So the
 * page *is* scrollable here, which means the remaining explanations are macOS/Chrome gesture specific
 * and can only be bisected on the machine that shows the problem.
 *
 * The probe page applies the candidate CSS rules one pane at a time. Scroll it with two fingers and
 * the first pane where scrolling stops names the culprit:
 *
 *   1 baseline → 2 overscroll-behavior on the root → 3 + touch-action on controls → 4 touch-action
 *   only → 5 control.
 *
 * The page also logs to the console when a downward wheel fails to move it, so the answer can be
 * copied rather than described.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = Number(process.env.PROBE_PORT || 4318);
const FILE = path.join(process.cwd(), "scratch", "scroll-probe.html");

if (!fs.existsSync(FILE)) {
  console.error(`❌ ${FILE} is missing — the probe page is the point of this script.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const body = fs.readFileSync(FILE);
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`▶️  scroll probe: http://127.0.0.1:${PORT}`);
  console.log("   Open it in macOS Chrome and scroll with two fingers.");
  console.log("   Note the FIRST pane where scrolling stops — and check the console for a log line.");
  console.log("   Ctrl+C to stop.");
});
