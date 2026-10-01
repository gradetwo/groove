#!/usr/bin/env node
/**
 * ⭐ **判据：乐器采样的音高必须跟着音符走。**
 *
 * 为什么要它：一份现场报告量到 `vsco2ce:ViolinEnsSusVib` 的 midi 60 出 523.8 Hz ✗，
 * 归因为上游数据错位，并建议给那个 SFZ 加音高偏移校正 ✗。实测（本探针）表明该乐器在
 * midi 59/60/62 上都在 ±5 音分内 ✓——523.8 正好是 261.9 的二次谐波 ✓，即谱峰法取到了
 * 第二谐波而不是基频 ✓。**照那条建议去改，会把一个正确的乐器改坏** ✗✗。
 *
 * 所以这条判据的用途是**反向的**：钉住"音符 → 频率"的映射 ✓，任何人加上偏移（或把
 * ratio 算成两倍）都会让它变红 ✗✓。删除测试：把 `startSamplerNote` 的 ratio 乘 2，
 * 本探针必须整体报红 ✓。
 *
 * 求基频用自相关，不用 `analyze_audio`（它不报基频 ✗），也不用频谱主峰（持续弦乐的第二
 * 谐波常常强于基频 ✓，那正是这份报告踩的坑 ✓）。
 *
 * **两条路都测** ✓✓：`render_instrument_note`（走 `auditionInstrumentNote` ✓）与 `render_arrangement`
 * 的采样 lane（走 `offlineAudioLanes` + `startSamplerNote` ✓）。**两者分叉本身就是缺陷** ✗——按名定
 * 义同一个音符、同一个资产，必须落在同一个频率上 ✓。
 *
 *   node scripts/probe_instrument_pitch.mjs            # 断言 ±25 音分（两条路）
 *   node scripts/probe_instrument_pitch.mjs --cents=100 # 放宽（只用于诊断）
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const TOLERANCE = Number((process.argv.find((v) => v.startsWith("--cents=")) ?? "--cents=25").split("=")[1]);
const CASES = [
  ["vsco2ce:ViolinEnsSusVib", 59, "报告指控的那个乐器，低一个半音"],
  ["vsco2ce:ViolinEnsSusVib", 60, "中央 C——报告在这一条上读到 523.8 Hz"],
  ["vsco2ce:ViolinEnsSusVib", 62, "高一个全音"],
  ["vsco2ce:CelloEnsSusVib", 60, "对照：报告说它正确"],
];

function readWav(path) {
  const b = readFileSync(path);
  let pos = 12, fmt = null, data = null;
  while (pos + 8 <= b.length) {
    const id = b.toString("ascii", pos, pos + 4), size = b.readUInt32LE(pos + 4), body = pos + 8;
    if (id === "fmt ") fmt = { f: b.readUInt16LE(body), ch: b.readUInt16LE(body + 2), sr: b.readUInt32LE(body + 4), bits: b.readUInt16LE(body + 14) };
    if (id === "data") data = b.subarray(body, body + size);
    pos = body + size + (size % 2);
  }
  const { ch, sr, bits, f } = fmt, frames = data.length / (ch * (bits / 8)), out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const o = i * ch * (bits / 8);
    out[i] = f === 3 && bits === 32 ? data.readFloatLE(o) : bits === 16 ? data.readInt16LE(o) / 32768 : data.readInt32LE(o) / 2147483648;
  }
  return { samples: out, sampleRate: sr };
}

/** 自相关求基频：基频能量常常不是最大谱峰，所以不走谱峰。 */
function fundamental(samples, sampleRate, from, to, fmin = 60, fmax = 3000) {
  const seg = samples.subarray(from, to);
  let energy = 0;
  for (let i = 0; i < seg.length; i++) energy += seg[i] * seg[i];
  if (energy <= 1e-9) return 0;
  const lagMin = Math.floor(sampleRate / fmax), lagMax = Math.floor(sampleRate / fmin);
  let best = 0, bestLag = 0;
  for (let lag = lagMin; lag <= Math.min(lagMax, seg.length - 1); lag++) {
    let sum = 0;
    for (let i = 0; i + lag < seg.length; i++) sum += seg[i] * seg[i + lag];
    const norm = sum / (seg.length - lag);
    if (norm > best) { best = norm; bestLag = lag; }
  }
  return bestLag ? sampleRate / bestLag : 0;
}

const child = spawn(process.execPath, ["dist-mcp/groove-mcp.mjs"], { stdio: ["pipe", "pipe", "pipe"] });
let buf = "";
const pending = new Map();
let id = 0;
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i);
    buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    try { const m = JSON.parse(line); if (m.id !== undefined && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } } catch { /* partial */ }
  }
});
const request = (method, params) => new Promise((resolve) => { const n = ++id; pending.set(n, resolve); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n"); });

await request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "probe-instrument-pitch", version: "1" } });
child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

let failures = 0;
console.log(`断言：两条路各自在 ±${TOLERANCE} 音分内，且互相一致（自相关，不是谱峰）\n`);

/** 求解一次 WAV 的基频：取音符所在的窗口。 */
function pitchOf(path, from, to) {
  const w = readWav(path);
  const hz = fundamental(w.samples, w.sampleRate, Math.round(from * w.sampleRate), Math.round(to * w.sampleRate));
  return { hz, want: null };
}

/** 经 render_arrangement 的采样 lane 播同一个音符：这是第二条路。 */
async function viaArrangement(assetId, midi) {
  const made = await request("tools/call", { name: "create_arrangement", arguments: { blankKind: "sampler", name: `pitch ${assetId} ${midi}` } });
  const text = String(made?.result?.content?.[0]?.text ?? "");
  let arrId = null; try { const j = JSON.parse(text); arrId = j.arrangementId ?? j.id; } catch { /* ignore */ }
  if (!arrId) return { error: `create_arrangement 没有给出 id：${text.slice(0, 80)}` };
  /**
   * ⭐ **轨道 id 是读回来的，不是写死的** ✓。它按全局计数递增（`sampler-1`、`sampler-2`、…），
   * 所以写死 `sampler-1` 的探针只在"这个进程里第一个排列"时才碰巧对 ✓——**依赖运行顺序的判据是脆的** ✗✓。
   * 这与 Logic 计划里"alternative 编号不许硬编码成 `000`"是同一条规矩 ✓。
   */
  const got = await request("tools/call", { name: "get_arrangement", arguments: { arrangementId: arrId } });
  const gt = String(got?.result?.content?.[0]?.text ?? "");
  let tracks = []; try { const j = JSON.parse(gt); tracks = j.arrangement?.tracks ?? j.tracks ?? []; } catch { /* ignore */ }
  const trackId = tracks[0]?.track_id ?? tracks[0]?.id ?? tracks[0]?.trackId;
  if (!trackId) return { error: `读不到轨道 id：${gt.slice(0, 90)}` };
  const set = await request("tools/call", { name: "set_arrangement_track_instrument", arguments: { arrangementId: arrId, trackId, assetId } });
  if (set?.error || set?.result?.isError) return { error: `set_arrangement_track_instrument 失败：${String(set?.result?.content?.[0]?.text ?? set?.error).slice(0, 80)}` };
  const add = await request("tools/call", { name: "add_arrangement_notes", arguments: { arrangementId: arrId, trackId, notes: [{ pitch: midi, startBeats: 0, lengthBeats: 0.9, velocity: 100 }] } });
  if (add?.error || add?.result?.isError) return { error: `add_arrangement_notes 失败：${String(add?.result?.content?.[0]?.text ?? add?.error).slice(0, 80)}` };
  const rend = await request("tools/call", { name: "render_arrangement", arguments: { arrangementId: arrId, bars: 1 } });
  const rt = String(rend?.result?.content?.[0]?.text ?? JSON.stringify(rend?.error ?? rend));
  if (rend?.error || rend?.result?.isError) return { error: `render_arrangement 失败：${rt.slice(0, 80)}` };
  const path = (/\"path\"\s*:\s*\"([^\"]+)\"/.exec(rt) ?? [])[1];
  const skipped = /\"skippedLanes\"\s*:\s*\[([^\]]*)\]/.exec(rt)?.[1]?.trim();
  if (!path) return { error: `回复里没有 path` };
  return { path, skippedNote: skipped ? skipped.slice(0, 60) : null };
}
for (const [assetId, midi, why] of CASES) {
  const want = 440 * Math.pow(2, (midi - 69) / 12);
  const line = [];

  // 路一：render_instrument_note（走 auditionInstrumentNote）
  const reply = await request("tools/call", { name: "render_instrument_note", arguments: { assetId, midi, seconds: 2.0 } });
  const text = String(reply?.result?.content?.[0]?.text ?? JSON.stringify(reply?.error ?? reply));
  if (reply?.error || reply?.result?.isError) { console.log(`  ✗ ${assetId} midi ${midi}: render_instrument_note 失败 ${text.slice(0, 70)}`); failures += 1; continue; }
  const directPath = (/\"path\"\s*:\s*\"([^\"]+)\"/.exec(text) ?? [])[1];
  if (!directPath) { console.log(`  ✗ ${assetId} midi ${midi}: render_instrument_note 没给 path`); failures += 1; continue; }
  const direct = pitchOf(directPath, 0.3, 0.9);
  const directCents = direct.hz > 0 ? 1200 * Math.log2(direct.hz / want) : Number.NaN;
  const directOk = Number.isFinite(directCents) && Math.abs(directCents) <= TOLERANCE;
  if (!directOk) failures += 1;
  line.push(`instrument_note ${direct.hz.toFixed(1)} Hz（${directCents.toFixed(0)} 音分 ${directOk ? "✓" : "✗"}）`);

  // 路二：render_arrangement 的采样 lane
  const arr = await viaArrangement(assetId, midi);
  if (arr.error) { console.log(`  ✗ ${assetId} midi ${midi}: ${arr.error}`); failures += 1; continue; }
  const viaArr = pitchOf(arr.path, 0.3, 0.9);
  const arrCents = viaArr.hz > 0 ? 1200 * Math.log2(viaArr.hz / want) : Number.NaN;
  const arrOk = Number.isFinite(arrCents) && Math.abs(arrCents) <= TOLERANCE;
  if (!arrOk) failures += 1;
  line.push(`arrangement ${viaArr.hz.toFixed(1)} Hz（${arrCents.toFixed(0)} 音分 ${arrOk ? "✓" : "✗"}）`);

  // 两条路之间是否一致（这一条抓的是"同名不同义"）
  const skew = direct.hz > 0 && viaArr.hz > 0 ? Math.abs(1200 * Math.log2(viaArr.hz / direct.hz)) : Number.NaN;
  const agree = Number.isFinite(skew) && skew <= TOLERANCE;
  if (!agree) failures += 1;
  line.push(`两路相差 ${skew.toFixed(0)} 音分 ${agree ? "✓" : "✗"}`);

  console.log(`  ${directOk && arrOk && agree ? "✓" : "✗"} ${assetId.padEnd(28)} midi ${String(midi).padStart(3)}（应 ${want.toFixed(2)}）: ${line.join(" · ")}`);
  console.log(`      — ${why}`);
}
child.kill("SIGKILL");

console.log(failures === 0
  ? `\n⇒ 两条路各自都在 ±${TOLERANCE} 音分内，且互相一致 ✓✓：音符→频率的映射是对的；加任何偏移、或让两条路分叉，都会让这条判据变红 ✗✓`
  : `\n⇒ ${failures} 项不合格 ✗：不要靠加偏移掩盖，先查是哪一层（工具路径 or 某个采样区域）✗`);
process.exit(failures === 0 ? 0 : 1);
