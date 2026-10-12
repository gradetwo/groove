#!/usr/bin/env node
/**
 * Probe (not a gate): **does the MCP renderer recover when its Chromium dies mid-session?**
 *
 *   npm run mcp:build && node scripts/probe_browser_death_recovery.mjs
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

  const args = { genreId: "chicago-house", bars: 1 };
  console.log("第一次渲染（浏览器应被拉起）…");
  const first = await callTool("render_arrangement_preview", args).catch(() => callTool("render_audio", args));
  console.log(`  → ${first.ok ? "OK ✓" : "FAIL ✗"}  ${first.text}`);

  const pids = chromiumPids();
  console.log(`杀掉 ${pids.length} 个 Chromium 进程 ✗`);
  for (const pid of pids) { try { process.kill(pid, "SIGKILL"); } catch { /* gone */ } }
  await sleep(3000);
  console.log(`  → 剩余 Chromium: ${chromiumPids().length}`);

  console.log("第二次渲染（浏览器已死，看它是否自愈）…");
  const second = await callTool("render_arrangement_preview", args).catch(() => callTool("render_audio", args));
  console.log(`  → ${second.ok ? "OK ✓" : "FAIL ✗"}  ${second.text}`);
  console.log(
    second.ok
      ? "\n⇒ 自愈 ✓：浏览器死后下一次渲染会重建它。"
      : "\n⇒ 不自愈 ✗：浏览器死后该会话的渲染持续失败——这是长会话真正的寿命上限。"
  );
} finally {
  child.kill("SIGKILL");
}
