#!/usr/bin/env node
/**
 * Probe (not a gate): **does a large arrangement render, or does it hang, or does it fail with a reason?**
 *
 *   npm run mcp:build && node scripts/probe_arrangement_scale.mjs --samplers=8 --bars=8 --notes=16
 *
 * The field report lists "大 arrangement `render_arrangement` browser worker hang" as an open P0 that nobody here has
 * reproduced. The renderer has since gained three things a hang must now show up through: a **15-minute render budget**
 * that turns a stuck render into a timeout error naming what was being rendered, a **liveness check** that notices a
 * closed page or a disconnected browser and rebuilds it, and **`skippedLanes[].reason`**, which names why a lane
 * produced nothing. So the property this probe measures is:
 *
 *   a large arrangement either completes, or fails with a reported reason — and never hangs silently.
 *
 * "Silently" is the whole test, so the probe watches three things at once: the wall clock of the one `tools/call`, the
 * `notifications/progress` the server emits while it runs, and how the reply reads when it arrives. It builds the
 * fixture **through the real MCP tools** (`create_arrangement`, `add_arrangement_track`,
 * `set_arrangement_track_instrument`, `add_arrangement_notes`, `set_arrangement_bars`) rather than by importing the
 * engine, because the report is about the tool a caller can actually reach.
 *
 * A watchdog longer than the server's own 900 s budget is deliberate: a hang is "no answer **after** the budget and no
 * message", so the probe must outwait the budget to tell the two apart. `--watchdog=200` is for quick escalation runs
 * where the question is only "how long did it take".
 *
 * `--killAfterChromium=SEC` kills this server's own Chromium that many seconds **after it first appears** (a fixed delay
 * measured nothing: a 29 s render finished before a 45 s timer), and `--rerender=1` renders again afterwards, so the
 * liveness check's rebuild is measured rather than assumed.
 *
 * Exit codes: 0 = completed, or failed with a reason; 3 = **no answer at all** inside the watchdog (a hang); 2 = the
 * fixture could not be built, so nothing was measured.
 */
import { spawn } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = path.join(ROOT, "dist-mcp", "groove-mcp.mjs");

const arg = (name, fallback) => {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.split("=").slice(1).join("=") : fallback;
};
const num = (name, fallback) => Number(arg(name, String(fallback)));

const SAMPLERS = num("samplers", 1);
const INSTRUMENTS = num("instruments", 0);
const DRUMKITS = num("drumkits", 0);
const BARS = num("bars", 1);
const NOTES_PER_TRACK = num("notes", 1);
/** Default is the server's own budget plus a minute and a half: a hang is "still nothing after the budget said it would give up". */
const WATCHDOG_SEC = num("watchdog", Math.round(900_000 / 1000) + 90);
const SAMPLE_RATE = num("sampleRate", 44100);
const CHANNELS = num("channels", 2);
/** Kill this server's Chromium this many seconds into the render; 0 leaves the page alone. */
const KILL_AFTER_SEC = num("killAfter", 0);
/**
 * Kill this many seconds **after the browser first appears**, which is the robust way to land the kill inside the
 * render rather than inside the cold start. The first version used a fixed delay and killed nothing: a 4-track render
 * finished in 29 s and the 45 s timer was cleared before it fired.
 */
const KILL_AFTER_CHROMIUM_SEC = num("killAfterChromium", 0);
/** Render a second time after the first returns, so a dead page's recovery is measured rather than assumed. */
const RERENDER = arg("rerender", "0") === "1";
const LABEL = arg("label", `s${SAMPLERS}-i${INSTRUMENTS}-d${DRUMKITS}-b${BARS}-n${NOTES_PER_TRACK}`);

/** Distinct assets, so the fixture exercises more than one SFZ/sample set rather than the same file eight times. */
const ASSETS = [
  "vsco2ce:ViolinEnsSusVib",
  "vsco2ce:CelloEnsSusVib",
  "vsco2ce:FHornSus",
  "vsco2ce:FluteSusVib",
  "vsco2ce:TrumpetSus",
  "vsco2ce:ViolaEnsSusVib",
  "vsco2ce:BassoonSus",
  "vsco2ce:ClarinetSus",
];

const outDir = mkdtempSync(path.join(tmpdir(), "groove-scale-"));
const child = spawn(process.execPath, [BUNDLE], {
  cwd: ROOT,
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, GROOVE_MCP_OUT: outDir },
});

let id = 0;
const pending = new Map();
let buffer = "";
const progressByToken = new Map();
const progressMessages = [];

child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let index;
  while ((index = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, index);
    buffer = buffer.slice(index + 1);
    if (!line.trim()) continue;
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      continue;
    }
    if (msg.method === "notifications/progress") {
      const token = msg.params?.progressToken;
      progressByToken.set(token, (progressByToken.get(token) ?? 0) + 1);
      const message = msg.params?.message;
      if (message && !progressMessages.includes(message)) progressMessages.push(message);
      continue;
    }
    if (msg.id !== undefined && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }
});

const request = (method, params) =>
  new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: myId, method, params }) + "\n");
  });

const callTool = async (name, args, meta) => {
  const reply = await request("tools/call", { name, arguments: args, ...(meta ? { _meta: meta } : {}) });
  const text = reply?.result?.content?.[0]?.text ?? JSON.stringify(reply?.error ?? reply);
  return { ok: !reply?.error && !reply?.result?.isError, text: String(text), timedOut: false };
};

function chromiumPids(rootPid) {
  const ppidOf = (pid) => {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const tail = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      return Number(tail[1]);
    } catch {
      return null;
    }
  };
  const cmdlineOf = (pid) => {
    try {
      return readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ");
    } catch {
      return "";
    }
  };

  const parent = new Map();
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    const ppid = ppidOf(pid);
    if (ppid !== null) parent.set(pid, ppid);
  }
  const isDescendant = (pid) => {
    let cursor = pid;
    for (let hops = 0; hops < 12 && cursor > 1; hops += 1) {
      cursor = parent.get(cursor);
      if (cursor === undefined) return false;
      if (cursor === rootPid) return true;
    }
    return false;
  };
  const pids = [];
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (!isDescendant(pid)) continue;
    if (!/chromium_headless|chrome-linux|headless_shell/.test(cmdlineOf(pid))) continue;
    pids.push(pid);
  }
  return pids;
}

/**
 * Chromium RSS, so "memory was the binding constraint" can be a number rather than a guess — **scoped to this
 * server's own process tree**. A machine-wide name match would count other worktrees' browsers, which both inflates
 * the figure and encourages the name-based kill the project's docs record as unsafe.
 */
function chromiumRssMb(rootPid) {
  let totalKb = 0;
  const pids = chromiumPids(rootPid);
  for (const pid of pids) {
    try {
      totalKb += Number(/VmRSS:\s+(\d+) kB/.exec(readFileSync(`/proc/${pid}/status`, "utf8"))?.[1] ?? 0);
    } catch {
      /* gone between the list and the read */
    }
  }
  return { mb: Math.round(totalKb / 1024), count: pids.length };
}

const summary = (text) => {
  const parse = (pattern) => {
    const m = pattern.exec(text);
    return m ? m[1] : undefined;
  };
  /**
   * The lane lists are read from the reply's own JSON, not by counting substrings: "how many lanes reached the mix" and
   * "which lanes were skipped and why" are the two facts a silent stall would have to contradict, so they are parsed.
   */
  let lanes;
  let skippedLanes;
  let problems;
  let gs1PatchProblems;
  try {
    const parsed = JSON.parse(text);
    lanes = Array.isArray(parsed.renderedAudioLanes) ? parsed.renderedAudioLanes.length : undefined;
    skippedLanes = Array.isArray(parsed.skippedLanes) ? parsed.skippedLanes : undefined;
    problems = Array.isArray(parsed.problems) ? parsed.problems : undefined;
    gs1PatchProblems = Array.isArray(parsed.gs1PatchProblems) ? parsed.gs1PatchProblems : undefined;
  } catch {
    /* not JSON: the regexes below still say what they can */
  }
  return {
    durationSec: parse(/"durationSec"\s*:\s*([\d.]+)/),
    totalSteps: parse(/"totalSteps"\s*:\s*(\d+)/),
    lufs: parse(/"integratedLufs"\s*:\s*(-?[\d.]+)/),
    truePeakDb: parse(/"truePeakDb"\s*:\s*(-?[\d.]+)/),
    lanes,
    skippedLanes,
    problems,
    gs1PatchProblems,
    timeoutMessage: /did not answer within/.test(text),
    browserClosed: /Target page, context or browser has been closed/.test(text),
  };
};

let peakRss = { mb: 0, count: 0 };
const rssTimer = setInterval(() => {
  const now = chromiumRssMb(child.pid);
  if (now.mb > peakRss.mb) peakRss = now;
}, 2000);

const log = (...parts) => console.log(`[${LABEL}]`, ...parts);

try {
  await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "scale-probe", version: "1" } });
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

  /**
   * Build the fixture through the tools themselves, escalating track count. `get_arrangement` is read back rather than
   * inferred: the report's third P0 is that a new sampler track carries ghost notes, so "how many notes are in this
   * fixture" is a fact from the model and not the count this script asked for.
   */
  /** `create_arrangement` already makes the first track, so the additions are one fewer of that kind. */
  const firstKind = SAMPLERS > 0 ? "sampler" : INSTRUMENTS > 0 ? "instrument" : "drumkit";
  const created = await callTool("create_arrangement", { blankKind: firstKind });
  if (!created.ok) throw new Error(`create_arrangement failed: ${created.text}`);
  const arrangementId = /"arrangementId"\s*:\s*"([^"]+)"/.exec(created.text)?.[1];
  if (!arrangementId) throw new Error(`no arrangementId in reply: ${created.text.slice(0, 200)}`);

  const toAdd = [
    ...Array(Math.max(0, SAMPLERS - (firstKind === "sampler" ? 1 : 0))).fill("sampler"),
    ...Array(Math.max(0, INSTRUMENTS - (firstKind === "instrument" ? 1 : 0))).fill("instrument"),
    ...Array(Math.max(0, DRUMKITS - (firstKind === "drumkit" ? 1 : 0))).fill("drumkit"),
  ];
  for (const kind of toAdd) {
    const added = await callTool("add_arrangement_track", { arrangementId, kind });
    if (!added.ok) throw new Error(`add_arrangement_track(${kind}) failed: ${added.text}`);
  }

  const read = await callTool("get_arrangement", { arrangementId });
  if (!read.ok) throw new Error(`get_arrangement failed: ${read.text}`);
  const readBack = JSON.parse(read.text);
  const tracks = readBack.tracks ?? [];
  const samplerTracks = tracks.filter((track) => track.kind === "sampler");
  if (samplerTracks.length !== SAMPLERS) {
    throw new Error(`expected ${SAMPLERS} sampler tracks, model has ${samplerTracks.length}`);
  }

  for (let i = 0; i < samplerTracks.length; i += 1) {
    const set = await callTool("set_arrangement_track_instrument", {
      arrangementId,
      trackId: samplerTracks[i].id,
      assetId: ASSETS[i % ASSETS.length],
    });
    if (!set.ok) throw new Error(`set_arrangement_track_instrument failed: ${set.text}`);
  }

  /** Notes spread over the whole stated length, so a length increase is audible work rather than empty bars. */
  const beatsTotal = BARS * 4;
  for (const track of tracks) {
    if (track.kind === "fx" || track.kind === "folder") continue;
    const notes = [];
    for (let n = 0; n < NOTES_PER_TRACK; n += 1) {
      const startBeats = (n / NOTES_PER_TRACK) * beatsTotal;
      notes.push({
        pitch: track.kind === "drumkit" ? [36, 38, 42][n % 3] : 60 + (n % 12),
        startBeats,
        lengthBeats: Math.max(0.25, beatsTotal / NOTES_PER_TRACK / 2),
        velocity: 100,
      });
    }
    const added = await callTool("add_arrangement_notes", { arrangementId, trackId: track.id, notes });
    if (!added.ok) throw new Error(`add_arrangement_notes failed for ${track.id}: ${added.text}`);
  }

  const lengthSet = await callTool("set_arrangement_bars", { arrangementId, bars: BARS });
  if (!lengthSet.ok) throw new Error(`set_arrangement_bars failed: ${lengthSet.text}`);

  const before = JSON.parse((await callTool("get_arrangement", { arrangementId })).text);
  const noteCount = before.tracks.reduce((sum, track) => sum + (track.notes?.length ?? 0), 0);
  const assetList = samplerTracks.map((track, i) => ASSETS[i % ASSETS.length]).join(",");
  log(`fixture: ${tracks.length} track(s) [${SAMPLERS} sampler / ${INSTRUMENTS} instrument / ${DRUMKITS} drumkit], ${before.bars} bar(s), ${noteCount} note(s), steps=${before.steps}`);
  log(`assets: ${assetList}`);

  /**
   * ⭐ The one call under test. Everything the caller can learn about a stall is here: the reply, how long it took, the
   * progress that arrived while it ran, and — if nothing arrives — that fact itself.
   *
   * `--killAfter=SEC` kills **this server's own Chromium descendants** mid-render, which is the other half of "never
   * hangs silently": the page can die, and the caller still has to learn something. It is also the input to the
   * liveness check — the next call must rebuild rather than fail forever, which `--rerender=1` then measures.
   */
  const started = Date.now();
  let killedPids = 0;
  let killTimer;
  const killChromium = (why) => {
    const pids = chromiumPids(child.pid);
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
        killedPids += 1;
      } catch {
        /* already gone */
      }
    }
    log(`✂ ${why}：杀掉本 server 的 Chromium ${killedPids}/${pids.length} 个进程`);
  };
  if (KILL_AFTER_SEC > 0) killTimer = setTimeout(() => killChromium(`渲染开始后 ${KILL_AFTER_SEC}s`), KILL_AFTER_SEC * 1000);
  if (KILL_AFTER_CHROMIUM_SEC > 0) {
    // Wait for the browser to exist first, then count down: the cold start dominates a small render and a fixed
    // delay lands either before it or after the render has already returned.
    let seenAt;
    const watcher = setInterval(() => {
      if (seenAt === undefined) {
        if (chromiumPids(child.pid).length > 0) {
          seenAt = Date.now();
          log(`👀 浏览器已出现，${KILL_AFTER_CHROMIUM_SEC}s 后杀掉它`);
        }
        return;
      }
      if (Date.now() - seenAt >= KILL_AFTER_CHROMIUM_SEC * 1000) {
        clearInterval(watcher);
        killChromium(`浏览器出现后 ${KILL_AFTER_CHROMIUM_SEC}s`);
      }
    }, 500);
    killTimer = watcher;
  }
  const rendered = await Promise.race([
    callTool("render_arrangement", { arrangementId, sampleRate: SAMPLE_RATE, channels: CHANNELS }, { progressToken: 9001 }),
    new Promise((resolve) =>
      setTimeout(() => resolve({ ok: false, text: "(no reply)", timedOut: true }), WATCHDOG_SEC * 1000)
    ),
  ]);
  if (killTimer) {
    clearTimeout(killTimer);
    clearInterval(killTimer);
  }
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const progress = progressByToken.get(9001) ?? 0;

  if (rendered.timedOut) {
    console.log("");
    log(`⇒ HANG ✗：${WATCHDOG_SEC} s 内没有任何回复，进度通知 ${progress} 条。`);
    log(`   chromium 峰值 RSS ${peakRss.mb} MB / ${peakRss.count} 进程。`);
    process.exitCode = 3;
  } else {
    const fields = summary(rendered.text);
    console.log("");
    log(`${rendered.ok ? "完成 ✓" : "失败（带原因）"}  墙钟 ${seconds} s，预算 900 s，进度通知 ${progress} 条`);
    log(`  durationSec=${fields.durationSec ?? "?"} totalSteps=${fields.totalSteps ?? "?"} LUFS=${fields.lufs ?? "?"} truePeak=${fields.truePeakDb ?? "?"}`);
    log(`  renderedAudioLanes=${fields.lanes ?? "?"} skippedLanes=${fields.skippedLanes ? fields.skippedLanes.length : "none"} problems=${fields.problems ? fields.problems.length : "none"} gs1PatchProblems=${fields.gs1PatchProblems ? fields.gs1PatchProblems.length : "none"}`);
    if (fields.skippedLanes?.length) log(`  跳过的轨道：${fields.skippedLanes.map((lane) => `${lane.track_id}: ${lane.reason}`).join(" ｜ ")}`);
    if (fields.timeoutMessage) log(`  ⏱ 这是服务器自己的超时句：${rendered.text.slice(0, 240)}`);
    if (fields.browserClosed) log(`  🧟 浏览器已关：${rendered.text.slice(0, 240)}`);
    if (!rendered.ok && !fields.timeoutMessage && !fields.browserClosed) log(`  失败文本：${rendered.text.slice(0, 300)}`);
    log(`  chromium 峰值 RSS ${peakRss.mb} MB / ${peakRss.count} 进程`);
    if (progressMessages.length) log(`  进度：${progressMessages.slice(0, 4).join(" ｜ ")}`);
    log(rendered.ok ? "⇒ 大 arrangement 完成了 ✓" : "⇒ 大 arrangement 没有静默挂起 ✓（返回了可读的失败）");

    /**
     * The liveness half: after the page died, does the **next** call rebuild and work, or is the session finished?
     * Before `ensurePage`'s liveness check this failed for every later render (`docs/WORKLET_AVAILABILITY.md`).
     */
    if (RERENDER) {
      const rebuildStarted = Date.now();
      const again = await Promise.race([
        callTool("render_arrangement", { arrangementId, sampleRate: SAMPLE_RATE, channels: CHANNELS }, { progressToken: 9002 }),
        new Promise((resolve) => setTimeout(() => resolve({ ok: false, text: "(no reply)", timedOut: true }), WATCHDOG_SEC * 1000)),
      ]);
      const rebuildSeconds = ((Date.now() - rebuildStarted) / 1000).toFixed(1);
      if (again.timedOut) {
        log(`⇒ 重建后的第二次渲染 HANG ✗（${WATCHDOG_SEC} s 无回复）`);
        process.exitCode = 3;
      } else {
        const second = summary(again.text);
        log(`  第二次渲染（浏览器已死过）：${again.ok ? "完成 ✓" : "失败 ✗"} 墙钟 ${rebuildSeconds} s，durationSec=${second.durationSec ?? "?"}`);
        if (!again.ok) log(`  第二次失败文本：${again.text.slice(0, 300)}`);
        log(again.ok ? "⇒ 存活检查重建了浏览器，会话继续 ✓" : "⇒ 死页面之后不会自愈 ✗");
      }
    }
  }
} catch (error) {
  console.error(`[${LABEL}] fixture/render threw: ${error?.message ?? error}`);
  process.exitCode = 2;
} finally {
  clearInterval(rssTimer);
  /**
   * ⭐ **Reap through the server's own lifecycle, not by name.** `installRendererLifecycle` closes the browser on stdin
   * EOF; killing the tree by process name would reach other worktrees' browsers, which is the mistake
   * `docs/WORKLET_AVAILABILITY.md` records. The probe reports what is left so a leak is visible rather than assumed away.
   */
  const before = chromiumRssMb(child.pid);
  child.stdin.end();
  await new Promise((resolve) => setTimeout(resolve, 3000));
  child.kill("SIGKILL");
  await new Promise((resolve) => setTimeout(resolve, 500));
  const after = chromiumRssMb(child.pid);
  console.log(`[${LABEL}] chromium 进程：收尾前 ${before.count} → 收尾后 ${after.count}（收尾前共 ${before.mb} MB）`);
  /**
   * ⭐ **Exit explicitly.** A killed MCP server can leave its stdout pipe held by a grandchild (Vite), and the probe's
   * `data` listeners on that pipe then keep this process in `epoll_wait` forever — measured: a finished 16-track run
   * stayed alive for twelve minutes and had to be killed by hand while the next run was rendering. The work is done
   * and printed; nothing is left to await.
   */
  child.stdout?.destroy();
  child.stderr?.destroy();
  child.stdin?.destroy();
  process.exit(process.exitCode ?? 0);
}
