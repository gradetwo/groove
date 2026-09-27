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
      arguments: { genreId: genre, ops: [{ op: "clear_track", trackId: "fx" }] },
    })
  );
  /**
   * The op's reply is the one thing this probe cannot guess, and the first run of it crashed instead of saying so:
   * `Cannot read properties of undefined (reading 'tracks')` at the line that assumed `{ pattern }`. A probe that dies on an
   * unexpected shape costs a twenty-minute CI round trip, so the shape is checked and the server's own answer is printed.
   */
  if (!cleared?.pattern) {
    throw new Error(`apply_pattern_ops did not return a pattern — the server said: ${JSON.stringify(cleared).slice(0, 300)}`);
  }
  await client.request("tools/call", {
    name: "set_clip",
    arguments: { songId: withoutTexture.songId, slot: "A", pattern: cleared.pattern },
  });

  const read = async (songId, label) => {
    const rendered = payload(await client.request("tools/call", { name: "render_song", arguments: { songId, format: "wav" } }));
    const analysed = payload(await client.request("tools/call", { name: "analyze_audio", arguments: { path: rendered.path } }));
    return { label, path: rendered.path, integratedLufs: analysed.integratedLufs, truePeakDb: analysed.truePeakDb, bands: analysed.bands ?? analysed.spectrum ?? null };
  };

  const withLane = await read(asWritten.songId, "as written");
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

  const deltaLufs =
    Number.isFinite(withLane.integratedLufs) && Number.isFinite(withoutLane.integratedLufs)
      ? Number((withLane.integratedLufs - withoutLane.integratedLufs).toFixed(2))
      : null;

  console.log(`\ntexture lane contribution (${genre}):`);
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
} finally {
  client.close?.();
}
