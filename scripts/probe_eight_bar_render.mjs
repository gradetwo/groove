#!/usr/bin/env node
/**
 * Probe (not a gate): **does a real eight-bar render finish inside the budget, and does it report progress?**
 *
 *   npm run mcp:build && node scripts/probe_eight_bar_render.mjs
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
  return { ok: !reply?.error && !reply?.result?.isError, text: String(text) };
};

try {
  /**
   * ⭐ **The goal's own worst case, end to end.** Eight bars is 125.56 s of audio and was measured at
   * 445.71–511.28 s of wall clock — the case that used to hit a client's thirty-second timeout and the
   * browser's lifespan before any sound came back. This asks the two questions the goal is about: does it
   * finish inside the server's own budget, and does a caller that supplies a progress token see anything
   * while it runs, rather than a seven-minute silence.
   */
  await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  const bars = Number((process.argv.find((v) => v.startsWith("--bars=")) ?? "--bars=8").split("=")[1]);
  const genre = (process.argv.find((v) => v.startsWith("--genre=")) ?? "--genre=chicago-house").split("=")[1];
  const token = 4242;

  let notifications = 0;
  const phases = [];
  child.stdout.on("data", (chunk) => {
    for (const line of String(chunk).split("\n")) {
      if (!line.includes("progress")) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.method === "notifications/progress") {
          notifications += 1;
          const message = msg.params?.message ?? "";
          if (message && !phases.includes(message)) phases.push(message);
        }
      } catch { /* partial line */ }
    }
  });

  const started = Date.now();
  const reply = await request("tools/call", {
    name: "render_audio",
    arguments: { genreId: genre, bars, sampleRate: 44100, channels: 2 },
    _meta: { progressToken: token },
  });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const text = String(reply?.result?.content?.[0]?.text ?? JSON.stringify(reply?.error ?? reply));
  const ok = !reply?.error && !reply?.result?.isError;
  const lufs = /"integratedLufs"\s*:\s*(-?[\d.]+)/.exec(text)?.[1];
  const durationSec = /"durationSec"\s*:\s*([\d.]+)/.exec(text)?.[1];
  const sampleRate = /"sampleRate"\s*:\s*(\d+)/.exec(text)?.[1];
  const channels = /"channels"\s*:\s*(\d+)/.exec(text)?.[1];

  console.log(`\n${bars} 小节 / ${genre}：${ok ? "完成 ✓" : "失败 ✗"}，用时 ${seconds} s（预算 900 s）`);
  console.log(`  进度通知 ${notifications} 条${phases.length ? "：" + phases.slice(0, 4).join(" ｜ ") : ""}`);
  console.log(`  ${lufs ? "integratedLufs " + Number(lufs).toFixed(2) : "（未解析到 LUFS）"}`);
  if (durationSec) {
    const audio = Number(durationSec);
    console.log(`  音频 ${audio.toFixed(2)} s @ ${sampleRate} Hz / ${channels} ch ⇒ ${(audio / Number(seconds)).toFixed(2)}× 实时`);
  }
  console.log(ok && notifications > 0
    ? "⇒ 长曲在预算内完成 ✓，且调用方能看到进度 ✓（不再是七分钟静默）"
    : ok
      ? "⇒ 完成了 ✓，但一条进度都没有 ✗——带 token 的调用方仍是静默等待。"
      : "⇒ 失败 ✗：这就是目标要消灭的那种撞上限。");
} finally {
  child.kill("SIGKILL");
}
