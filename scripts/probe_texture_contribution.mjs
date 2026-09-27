/**
 * A4's remaining question, measured through the MCP rather than through a browser probe.
 *
 * Every previous attempt to answer "is the `fx` lane audible?" used a **top-end proxy**, and a proxy can only say a lane is not
 * high-frequency — not that it is silent. The census then showed the lane exists in 159 of 159 genres **and holds notes in all of
 * them**, so the question is what that material contributes to the **whole mix**. The MCP already answers exactly that:
 * `render_song` bounces a song and `analyze_audio` reports its gated loudness and 13-band shape.
 *
 * So this renders one genre's song twice — as written, and with the `fx` lane cleared — and prints both readings. A mix that moves
 * means the lane is audible and A4 closes; a mix that does not means the lane's level or instrument is what has to change, which is
 * an audio edit behind a CI baseline re-record.
 *
 *   node scripts/probe_texture_contribution.mjs [--genre=techno] [--out=report.json]
 */

const value = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
};
const genre = value("genre", "hard-techno");
const out = value("out", "");
const BUNDLE = path.resolve("dist-mcp/groove-mcp.mjs");

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

if (!fs.existsSync(BUNDLE)) {
  console.error(`❌ ${path.relative(ROOT, BUNDLE)} is missing — run \`npm run mcp:build\` first.`);
  process.exit(1);
}

/** A minimal MCP stdio client: newline-delimited JSON-RPC, one request at a time. */
class Client {
  constructor() {
    this.child = spawn(process.execPath, [BUNDLE], { stdio: ["pipe", "pipe", "pipe"] });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = "";
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
          continue; // not a protocol frame (should not happen: stdout is protocol-only)
        }
        const resolve = this.pending.get(message.id);
        if (resolve) {
          this.pending.delete(message.id);
          resolve(message);
        }
      }
    });
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString();
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${method} timed out`)), 30000);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        if (message.error) reject(new Error(`${method}: ${message.error.message}`));
        else resolve(message.result);
      });
      this.child.stdin.write(payload);
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async close() {
    this.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

const failures = [];
const notes = [];
const check = (label, ok, detail = "") => {
  if (ok) notes.push(`✅ ${label}`);
  else failures.push(`❌ ${label}${detail ? ` — ${detail}` : ""}`);
};

/** MCP tool results carry JSON in a text block; parse it back for assertions. */
const client = new Client();
const payload = (result) => {
  const text = result?.content?.find((part) => part.type === "text")?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

try {
  await client.request("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "texture-probe", version: "1" } });

  const asWritten = payload(await client.request("tools/call", { name: "create_song", arguments: { genreId: genre, bars: 4 } }));
  if (!asWritten.songId) throw new Error(`create_song failed: ${JSON.stringify(asWritten).slice(0, 200)}`);

  // A second song whose `fx` lane is cleared: everything else is identical, so the difference is that lane.
  const withoutTexture = payload(await client.request("tools/call", { name: "create_song", arguments: { genreId: genre, bars: 4 } }));
  const cleared = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { genreId: genre, ops: [{ op: "clear_track", track: "fx" }] },
    })
  );
  /**
   * The op's reply is the one thing this probe cannot guess, and the first run of it crashed instead of saying so:
   * `Cannot read properties of undefined (reading 'tracks')` at the line that assumed `{ pattern }`. A probe that dies on an
   * unexpected shape costs a twenty-minute CI round trip, so the shape is checked and the server's own answer is printed.
   */
  console.log(`  clear_track     : ${JSON.stringify(cleared?.applied ?? cleared).slice(0, 200)}`);
  if (!cleared?.pattern) {
    throw new Error(`apply_pattern_ops did not return a pattern — the server said: ${JSON.stringify(cleared).slice(0, 300)}`);
  }
  await client.request("tools/call", {
    name: "set_clip",
    arguments: { songId: withoutTexture.songId, slot: "A", pattern: cleared.pattern },
  });

  const timings = [];
  const read = async (songId, label) => {
    const startedAt = Date.now();
    const rendered = payload(await client.request("tools/call", { name: "render_song", arguments: { songId, format: "wav" } }));
    const analysed = payload(await client.request("tools/call", { name: "analyze_audio", arguments: { path: rendered.path } }));
    /**
     * The keys come out with the reading, because `analyze_audio`'s shape is the one thing this probe has had to guess twice —
     * and the **bands** matter more than the loudness here: under a master limiter, adding a quiet element moves integrated
     * loudness very little whether or not the element is audible, which is why "saturated moved it 0.2 LU" is a weak statement and
     * a band comparison is a strong one.
     */
    return {
      label,
      path: rendered.path,
      integratedLufs: analysed.integratedLufs,
      truePeakDb: analysed.truePeakDb,
      // The reply's keys, because its shape is the one thing this probe has had to guess twice.
      seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      metricKeys: Object.keys(analysed).slice(0, 24),
      // The bands matter more than the loudness: under a master limiter a quiet element barely moves the whole-file figure.
      bands: analysed.bandDb ?? null,
      centroidHz: analysed.centroidHz ?? null,
    };
  };

  const withLane = await read(asWritten.songId, "as written");
  /**
   * The same song at 8 kHz, which is the analysis lever: `WavExporter` builds its context at the requested rate, so this really does
   * render fewer samples. The two readings' `seconds` are the number the budget table needs.
   */
  const analysisRate = payload(await client.request("tools/call", { name: "create_song", arguments: { genreId: genre, bars: 4 } }));

  /**
   * Recommendation 5's acceptance, in the audio scope because it **renders** — `check:mcp` is deliberately browser-free, so this cannot live
   * there. The tool is allowed either answer: reach the target, or reach the true-peak ceiling and say so. Both are correct; only silence
   * about which one happened would be a failure.
   *
   * The −14 target is deliberately higher than the mix's natural level, so the trim should be positive and the ceiling should not bind —
   * if the ceiling does bind here, that is worth knowing and the detail line says so.
   */
  const normalized = payload(
    await client.request("tools/call", {
      name: "normalize_loudness",
      // Back to the ordinary target. The −24 experiment answered its question: the option **does** reach the graph (the mix moved 4.97 dB for a
      // requested 11.37 dB), and the shortfall was the control law, which treated an option that *replaces* the genre's trim as though it
      // adjusted it. With the base subtracted the tool should now land on the target in one call.
      arguments: { songId: analysisRate.songId, targetLufs: -14, truePeakCeilingDb: -1 },
    })
  );
  const targetAsked = normalized.targetLufs ?? -14;
  const withinTarget = Math.abs((normalized.after?.integratedLufs ?? NaN) - targetAsked) <= 0.3;
  const peakLimited =
    normalized.limitedBy === "truePeak" && (normalized.after?.truePeakDb ?? NaN) <= (normalized.truePeakCeilingDb ?? -1) + 0.1;
  /**
   * The third outcome, and it has to be **proven by the readings** rather than accepted as an excuse: the master limiter holding the output is a
   * claim about the graph, so the check requires that the peak did not move across every attempt the tool made. A tool that missed the target and
   * merely said "the limiter did it" would fail here, which is the point.
   */
  const limiterHeld =
    normalized.limitedBy === "masterLimiter" &&
    Array.isArray(normalized.attempts) &&
    normalized.attempts.length >= 2 &&
    normalized.attempts.every((attempt) => Math.abs(attempt.truePeakDb - normalized.attempts[0].truePeakDb) <= 0.05);
  const loudnessOk = Boolean(normalized.after) && (withinTarget || peakLimited || limiterHeld);
  check(
    `normalize_loudness reaches ${normalized.targetLufs ?? -14} LUFS or reports the ceiling that stopped it`,
    loudnessOk,
    `${normalized.before?.integratedLufs} → ${normalized.after?.integratedLufs} LUFS (trim ${normalized.appliedTrimDb} dB, ${normalized.limitedBy}, peaks ${normalized.after?.truePeakDb})`
  );
  // Printed here **and** flushed at the end: this probe's `check` helper only collects, and until this round nothing printed the arrays, so
  // every check in this file had been silent — the numbers that appeared were plain `console.log` calls.
  console.log(
    `  ${loudnessOk ? "✅" : "❌"} normalize_loudness : ${normalized.before?.integratedLufs} → ${normalized.after?.integratedLufs} LUFS ` +
      `(target ${normalized.targetLufs ?? -14}, trim ${normalized.appliedTrimDb} dB, ${normalized.limitedBy}, ${normalized.passes} pass(es), peaks ${normalized.after?.truePeakDb})`
  );
  if (!loudnessOk) process.exitCode = 1;
  const coarse = await (async () => {
    const startedAt = Date.now();
    const rendered = payload(
      await client.request("tools/call", { name: "render_song", arguments: { songId: analysisRate.songId, format: "wav", sampleRate: 8000 , channels: 1 } })
    );
    const analysed = payload(await client.request("tools/call", { name: "analyze_audio", arguments: { path: rendered.path } }));
    return {
      label: "8 kHz analysis render",
      seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      sampleRate: rendered.sampleRate ?? 8000,
      channels: rendered.channels ?? null,
      replyKeys: Object.keys(rendered).slice(0, 24),
      failureText: typeof rendered.raw === "string" ? rendered.raw.slice(0, 200) : null,
      integratedLufs: analysed.integratedLufs,
      metricKeys: Object.keys(analysed).slice(0, 6),
      bands: analysed.bandDb ?? null,
      centroidHz: analysed.centroidHz ?? null,
    };
  })();
  const withoutLane = await read(withoutTexture.songId, "fx lane cleared");

  /**
   * The next rung: the same song with the `fx` lane **rewritten** to something unmistakable.
   *
   * "Cleared" and "as written" measure the same thing in opposite directions, so if the lane is inaudible both readings agree — and
   * they did, to nine hundred-thousandths of a LU. Turning the lane up is not the fix (its mix level is already 0.3–0.68 and the
   * engine wires it to `noiseSweep`), so the question is whether **the voice makes sound at all** or whether the genre's own note data
   * is what is quiet. A lane saturated with steps at full velocity and a definite pitch answers that: if this still moves nothing, the
   * preset is silent; if it moves, the data is.
   */
  const loud = structuredClone(cleared.pattern);
  const fxLane = (loud.tracks ?? []).find((track) => /(^|[^a-z])(fx|riser|texture|sweep|noise)([^a-z]|$)/.test(`${track.track_id ?? ""} ${track.name ?? ""}`.toLowerCase()));
  let rewrite = null;
  if (fxLane) {
    fxLane.steps = (fxLane.steps ?? []).map(() => 1);
    fxLane.velocity = (fxLane.steps ?? []).map(() => 120);
    if (Array.isArray(fxLane.pitch)) fxLane.pitch = fxLane.pitch.map(() => 60);
    const loudSong = payload(await client.request("tools/call", { name: "create_song", arguments: { genreId: genre, bars: 4 } }));
    await client.request("tools/call", { name: "set_clip", arguments: { songId: loudSong.songId, slot: "A", pattern: loud } });
    rewrite = await read(loudSong.songId, "fx lane saturated");
  }

  /** The bands, when the analyser names them — the metric that can see a quiet lane under a limiter. */
  if (Array.isArray(withLane.bands) && Array.isArray(withoutLane.bands)) {
    const deltas = withLane.bands.map((value, index) => Number((value - (withoutLane.bands[index] ?? value)).toFixed(2)));
    console.log(`  band deltas     : [${deltas.join(", ")}] dB (as written minus cleared)`);
  } else {
    console.log("  band deltas     : no band array in the analyser's reply (see the keys above)");
  }

  console.log(`  analyze keys    : ${(withLane.metricKeys ?? []).join(", ")}`);
  if (Number.isFinite(withLane.centroidHz) && Number.isFinite(withoutLane.centroidHz)) {
    console.log(
      `  centroid        : ${withLane.centroidHz} Hz as written · ${withoutLane.centroidHz} Hz cleared — where the lane sits`
    );
  }
  if (Array.isArray(withLane.bands) && Array.isArray(withoutLane.bands)) {
    const deltas = withLane.bands.map((value, index) => Number((value - (withoutLane.bands[index] ?? value)).toFixed(2)));
    console.log(`  band deltas     : [${deltas.join(", ")}] dB (as written minus cleared)`);
  } else {
    console.log("  band deltas     : no band array in the analyser reply (see the keys above)");
  }

  const deltaLufs =
    Number.isFinite(withLane.integratedLufs) && Number.isFinite(withoutLane.integratedLufs)
      ? Number((withLane.integratedLufs - withoutLane.integratedLufs).toFixed(2))
      : null;

  console.log(`\ntexture lane contribution (${genre}):`);
  console.log(`  analyze keys    : ${(withLane.metricKeys ?? []).join(", ")}`);
  console.log(`  as written      : ${withLane.integratedLufs} LUFS · true peak ${withLane.truePeakDb} dBFS`);
  console.log(`  fx lane cleared : ${withoutLane.integratedLufs} LUFS · true peak ${withoutLane.truePeakDb} dBFS`);
  console.log(`  difference      : ${deltaLufs === null ? "n/a" : `${deltaLufs} LU`} — a mix that moves means the lane is audible`);
  if (rewrite) {
    const deltaLoud = Number((withLane.integratedLufs - rewrite.integratedLufs).toFixed(2));
    console.log(`  fx saturated    : ${rewrite.integratedLufs} LUFS — ${deltaLoud} LU against "as written"`);
    console.log(
      deltaLoud === 0
        ? "  → a saturated lane still moves nothing: the voice/preset is what is silent, not the notes"
        : "  → a saturated lane moves the mix: the genres' fx note data is what is quiet"
    );
    /**
   * The timings, because the SLO table in `docs/MCP.md` is only worth publishing if a CI run keeps producing the numbers.
   */
  for (const reading of [withLane, withoutLane, rewrite, coarse].filter(Boolean)) {
    timings.push(`${reading.label} ${reading.seconds}s`);
  }
  console.log(`  render timings  : ${timings.join(" · ")}`);
  console.log(`  render reply    : ${(coarse.replyKeys ?? []).join(", ")}`);
  if (coarse.failureText) console.log(`  render failure  : ${coarse.failureText}`);
  console.log(
    `  analysis pass   : ${coarse.sampleRate} Hz, ${coarse.channels ?? "?"} channel(s), at ${coarse.seconds}s` +
      (withLane.seconds ? ` (44.1 kHz took ${withLane.seconds}s)` : "")
  );

  if (out) {
      const report = JSON.parse((await import("node:fs")).readFileSync(out, "utf8"));
      report.rewrite = rewrite;
      report.deltaLoudLufs = deltaLoud;
      (await import("node:fs")).writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
    }
  }

  if (out) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify({ genre, withLane, withoutLane, deltaLufs }, null, 2)}\n`);
    console.log(`  report          : ${out}`);
  }
  /**
   * The checks, at last.
   *
   * `check(...)` has always pushed into `notes` and `failures`, and nothing ever printed either: the visible output of this probe came
   * entirely from `console.log`. A check nobody reads is the "command that silently did nothing" failure mode in its purest form, so the
   * arrays are flushed here and a failure sets the exit code.
   */
  for (const line of notes) console.log(`  ${line}`);
  for (const line of failures) console.error(`  ${line}`);
  if (failures.length) process.exitCode = 1;
} finally {
  client.close?.();
}
