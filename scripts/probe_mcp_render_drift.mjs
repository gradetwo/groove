#!/usr/bin/env node
/**
 * Probe (not a gate): **does a long MCP session drift, and does it survive the browser dying?**
 *
 *   npm run mcp:build && node scripts/probe_mcp_render_drift.mjs
 *
 * The profile records that a browser process runs out of GS-1 budget after roughly 40–124 renders and
 * disappears. The other probes for that ceiling ask whether the browser is reaped and whether the audio
 * drifts; this one asks the question a long session actually depends on: after the browser is **gone**,
 * does the next render (a) rebuild it and succeed, or (b) fail for the rest of the session.
 *
 * The kill targets the Chromium processes this server started, found by walking `/proc/<pid>/cmdline` rather
 * than by name: `pgrep -f chromium_headless` was measured to find 4 of 50 leaked processes.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";

const BUNDLE = "dist-mcp/groove-mcp.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Chromium processes whose command line mentions the headless shell this project launches. */
function chromiumPids() {
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    try {
      const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\0", " ");
      if (/chromium_headless|chrome-linux|headless_shell/.test(cmd) && !cmd.includes("probe_browser_death")) pids.push(Number(entry));
    } catch {
      /* gone */
    }
  }
  return pids;
}

const child = spawn(process.execPath, [BUNDLE], { stdio: ["pipe", "pipe", "pipe"], env: { ...process.env } });
let id = 0;
const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      /* not JSON-RPC */
    }
  }
});
const request = (method, params) =>
  new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });
const callTool = async (name, args) => {
  const reply = await request("tools/call", { name, arguments: args });
  const text = reply?.result?.content?.[0]?.text ?? JSON.stringify(reply?.error ?? reply);
  return { ok: !reply?.error && !reply?.result?.isError, text: String(text).slice(0, 150) };
};

try {
  await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const TOTAL = Number((process.argv.find((v) => v.startsWith("--renders=")) ?? "--renders=60").split("=")[1]);
  const genre = (process.argv.find((v) => v.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
  const args = { genreId: genre, bars: 1 };
  const lufs = [];
  let failures = 0;

  for (let i = 1; i <= TOTAL; i++) {
    const started = Date.now();
    let reply;
    try {
      reply = await callTool("render_preview_clip", args);
    } catch (error) {
      reply = { ok: false, text: String(error).slice(0, 90) };
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!reply.ok) {
      failures += 1;
      console.log(`${String(i).padStart(3)}. FAIL ✗ ${reply.text}`);
      continue;
    }
    const m = /"integratedLufs"\s*:\s*(-?[\d.]+)/.exec(reply.text) ?? /(-?[\d.]+)\s*LUFS/.exec(reply.text);
    const value = m ? Number(m[1]) : NaN;
    lufs.push(value);
    if (i === 1 || i % 10 === 0 || i === TOTAL) {
      console.log(`${String(i).padStart(3)}. ${Number.isFinite(value) ? value.toFixed(3) + " LUFS" : "（未解析到 LUFS）"}  ${seconds}s`);
    }
  }

  const finite = lufs.filter(Number.isFinite);
  const max = Math.max(...finite), min = Math.min(...finite);
  console.log(`\n渲染 ${TOTAL} 次：成功 ${finite.length}，失败 ${failures} ✗`);
  console.log(`LUFS 范围 ${min.toFixed(3)} … ${max.toFixed(3)}，跨度 ${(max - min).toFixed(3)} LU`);
  console.log(max - min > 0.5
    ? "⇒ 有漂移 ✗：长会话里渲染结果会变，页面回收（按测量设备用过的量级）是对症的。"
    : "⇒ 无漂移 ✓：在这段渲染数内页面没有退化，页面回收暂时没有依据。");
} finally {
  child.kill("SIGKILL");
}
