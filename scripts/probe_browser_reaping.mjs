#!/usr/bin/env node
/**
 * **After the parent goes away, is any browser left behind?** — the criterion for the leak measured in
 * `docs/WORKLET_AVAILABILITY.md` (appendix: 50 processes whose `/proc/<pid>/cwd` pointed at a deleted directory,
 * including a Chromium that had outlived its agent by three hours).
 *
 * The leak's shape is not "the browser outlives the Node process that launched it" — Playwright's browser dies with its
 * pipe. It is **"the MCP server outlives its client"**: an agent ending closes the server's stdin, and the server used to
 * keep the Vite child and the browser alive indefinitely because nothing listened. So this probe drives the real server
 * over stdio, asks it to render (which starts Vite and Chromium), then simulates the agent going away and checks both
 * facts the criterion names: the server exits, and no browser process remains.
 *
 * Modes, because "kills the parent" has three honest readings and they take different paths through the fix:
 *
 *   · `--mode=stdin` (default) — close the server's stdin, which is what an agent exiting actually does. This is the
 *     path the three-hour leak went through, and the one that was missing entirely;
 *   · `--mode=signal` — `SIGTERM`, the graceful path, which must await `browser.close()`;
 *   · `--mode=kill` — `SIGKILL`, where no handler can run. The browser is expected to die with Playwright's pipe; this
 *     mode is here to keep that expectation honest rather than assumed.
 *
 * Exit codes: 0 = the server exited and left no browser, 1 = it did not, 3 = the watchdog fired.
 *
 *     npm run mcp:build && node scripts/probe_browser_reaping.mjs --mode=stdin
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installWatchdog } from "./lib/watchdog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = path.join(ROOT, "dist-mcp", "groove-mcp.mjs");
const mode = (process.argv.find((value) => value.startsWith("--mode=")) ?? "--mode=stdin").slice("--mode=".length);
if (!["stdin", "signal", "kill"].includes(mode)) {
  console.error(`unknown --mode=${mode}; expected stdin, signal or kill`);
  process.exit(2);
}
if (!existsSync(BUNDLE)) {
  console.error(`❌ ${path.relative(ROOT, BUNDLE)} is missing — run \`npm run mcp:build\` first.`);
  process.exit(1);
}

/**
 * Every Chromium process on the machine, found by `/proc/<pid>/exe` rather than by name matching.
 *
 * `pgrep -f chromium_headless` was measured to find **4 of 50** leaked processes (the document's own correction), while
 * the `/proc` walk finds all of them and, crucially, reports each one's cwd — which is what tells *our* browser from a
 * concurrently running worktree's. The probe only ever reports on processes that appeared during this run.
 */
function chromiumProcesses() {
  const found = [];
  for (const name of readdirSync("/proc")) {
    if (!/^\d+$/.test(name)) continue;
    let exe = "";
    try {
      exe = readlinkSync(`/proc/${name}/exe`);
    } catch {
      continue; // a process that exited mid-walk
    }
    if (!/chrom(e|ium)/i.test(exe)) continue;
    let cwd = "";
    try {
      cwd = readlinkSync(`/proc/${name}/cwd`);
    } catch {
      cwd = "?";
    }
    found.push({ pid: Number(name), exe, cwd });
  }
  return found;
}

const baseline = new Set(chromiumProcesses().map((process) => process.pid));
const appeared = () => chromiumProcesses().filter((process) => !baseline.has(process.pid));
/** Ours, by cwd: the server is started with `cwd: ROOT`, and Playwright's browser inherits it. */
const ours = (processes) => processes.filter((process) => process.cwd === ROOT || process.cwd.startsWith(`${ROOT}/`) || process.cwd.includes("(deleted)"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const failures = [];
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

const outDir = mkdtempSync(path.join(os.tmpdir(), "groove-reap-"));
let child = null;
const cleanup = async () => {
  if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  await sleep(500);
};
installWatchdog({ ms: 10 * 60_000, label: `probe_browser_reaping (${mode})`, onTimeout: cleanup });

/** A minimal MCP stdio client: newline-delimited JSON-RPC, one request at a time. */
class Client {
  constructor() {
    this.child = spawn(process.execPath, [BUNDLE], {
      cwd: ROOT,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GROOVE_MCP_ROOT: ROOT, GROOVE_MCP_OUT: outDir },
    });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk.toString();
      let index;
      while ((index = this.buffer.indexOf("\n")) !== -1) {
        const line = this.buffer.slice(0, index).trim();
        this.buffer = this.buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        const resolve = this.pending.get(message.id);
        if (resolve) {
          this.pending.delete(message.id);
          resolve(message);
        }
      }
    });
  }

  request(method, params, timeoutMs = 300_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out after ${timeoutMs}ms`)), timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
}

try {
  const client = new Client();
  child = client.child;

  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "groove-reaping-probe", version: "1.0.0" },
  });
  client.notify("notifications/initialized", {});

  /**
   * One bar of a real genre: enough to start Vite and Chromium through the real render path, short enough that the
   * probe measures reaping rather than rendering.
   */
  const rendered = await client.request("tools/call", { name: "render_audio", arguments: { genreId: "deep-house", bars: 1 } });
  const payload = JSON.parse(rendered?.content?.[0]?.text ?? "{}");
  check("the server really rendered a file (so a browser was started)", Boolean(payload.path), payload.path ?? JSON.stringify(payload).slice(0, 200));

  const during = appeared();
  console.log(`   browser processes that appeared during the render: ${during.length}`);
  for (const process of during) console.log(`     pid ${process.pid}  cwd=${process.cwd}  ${process.exe}`);
  check("a browser really was running before the parent was taken away", during.length > 0);

  const before = ours(appeared()).length;

  console.log(`\n--- taking the parent away (${mode}) ---`);
  if (mode === "stdin") child.stdin.end();
  else if (mode === "signal") child.kill("SIGTERM");
  else child.kill("SIGKILL");

  const exited = await Promise.race([
    new Promise((resolve) => child.on("exit", () => resolve(true))),
    sleep(30_000).then(() => false),
  ]);
  check(`the MCP server exited after ${mode}`, exited === true, exited ? "" : "still alive after 30s");

  // A moment for the browser to notice its pipe closed / for `close()` to finish.
  await sleep(4000);
  const survivors = ours(appeared());
  console.log(`   browser processes left behind: ${survivors.length}` + (before ? ` (was ${before})` : ""));
  for (const process of survivors) console.log(`     pid ${process.pid}  cwd=${process.cwd}  ${process.exe}`);
  check("no browser process is left behind", survivors.length === 0, survivors.map((process) => process.pid).join(", "));
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error(`❌ probe failed: ${error?.stack ?? error}`);
} finally {
  await cleanup();
}

console.log(failures.length === 0 ? `\nPASS  ${mode}: the parent gone, no browser left` : `\nFAIL  ${failures.join(" · ")}`);
process.exit(failures.length === 0 ? 0 : 1);
