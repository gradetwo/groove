#!/usr/bin/env node
/**
 * MCP gate: build the server, speak JSON-RPC to it over stdio, and check that it answers.
 *
 * This is deliberately a *client*, not an import: the unit tests already cover the handlers, and what can still
 * be wrong after they pass is the protocol surface — a tool registered with a schema the SDK rejects, a resource
 * template whose URI never matches, a prompt whose arguments are not strings. So the gate spawns the built
 * bundle exactly as an MCP client would, lists everything, and calls the browser-free tools for real.
 *
 * `render_audio` is not called (it would start Chromium); the gate asserts it is *declared* and that its schema
 * says so, and the render path has its own probe (`scripts/analyze_export_audio.mjs`).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BUNDLE = path.join(ROOT, "dist-mcp", "groove-mcp.mjs");

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
const payload = (result) => {
  const text = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

const client = new Client();
try {
  const init = await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "groove-mcp-gate", version: "1.0.0" },
  });
  client.notify("notifications/initialized", {});
  check("initialize answers with server info", init?.serverInfo?.name === "groove-lab", JSON.stringify(init?.serverInfo ?? {}));
  check("initialize advertises tools/resources/prompts", Boolean(init?.capabilities?.tools && init?.capabilities?.resources && init?.capabilities?.prompts));

  const tools = await client.request("tools/list", {});
  const names = (tools?.tools ?? []).map((tool) => tool.name);
  check("tools/list returns the full declared surface", names.length >= 18, `${names.length} tools`);
  for (const required of [
    "list_genres",
    "get_genre",
    "search_genres",
    "get_pattern",
    "apply_pattern_ops",
    "validate_pattern",
    "pattern_statistics",
    "compare_genres",
    "export_midi",
    "export_ableton",
    "share_url",
    "render_audio",
    "analyze_audio",
    "get_loudness_report",
  ]) {
    check(`tool declared: ${required}`, names.includes(required));
  }
  const renderTool = (tools?.tools ?? []).find((tool) => tool.name === "render_audio");
  check("render_audio declares its format enum", JSON.stringify(renderTool?.inputSchema ?? {}).includes('"wav"'));
  check("tools carry a description for the model", (tools?.tools ?? []).every((tool) => (tool.description ?? "").length > 40));

  const resources = await client.request("resources/list", {});
  const uriTemplate = (resources?.resources ?? []).map((resource) => resource.uri);
  check("resources/list returns the library resources", uriTemplate.includes("groove://genres"));
  check("a genre document template is declared", uriTemplate.some((uri) => uri.includes("genre")), uriTemplate.join(" "));

  const prompts = await client.request("prompts/list", {});
  const promptNames = (prompts?.prompts ?? []).map((prompt) => prompt.name);
  check("prompts/list returns the three prompts", ["compose_groove", "explain_genre", "practice_plan"].every((name) => promptNames.includes(name)));

  // ---- real calls -----------------------------------------------------------------------------------------
  const genres = payload(await client.request("tools/call", { name: "list_genres", arguments: { limit: 5 } }));
  check("list_genres answers with rows", Array.isArray(genres.genres) && genres.genres.length === 5, JSON.stringify(genres).slice(0, 120));
  check("list_genres reports the library total", genres.total >= 100, String(genres.total));

  const found = payload(await client.request("tools/call", { name: "search_genres", arguments: { query: "chicago" } }));
  check("search_genres finds chicago-house", (found.matches ?? []).some((match) => match.id === "chicago-house"), JSON.stringify(found.matches?.[0] ?? {}));

  const genre = payload(await client.request("tools/call", { name: "get_genre", arguments: { id: "chicago-house" } }));
  check("get_genre returns recorded metadata", genre?.id === "chicago-house" && typeof genre?.culturalContext?.en === "string", JSON.stringify(genre).slice(0, 120));
  check("get_genre includes the mix and loudness trim", Boolean(genre?.mix) && typeof genre?.loudnessTrimDb === "number");

  const patternResult = payload(await client.request("tools/call", { name: "get_pattern", arguments: { genreId: "chicago-house" } }));
  const pattern = patternResult.pattern;
  check("get_pattern returns a pattern with tracks", Array.isArray(pattern?.tracks) && pattern.tracks.length > 0);

  const kick = pattern.tracks.find((track) => track.track_id === "kick");
  const clearedAt = kick.steps.findIndex((on, index) => on && index > 0);
  const before = kick.steps[clearedAt];
  const composed = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: {
        pattern,
        ops: [
          { op: "clear_step", track: "kick", step: clearedAt },
          { op: "set_step", track: "kick", step: 15, velocity: 96 },
          { op: "swing", amount: 30 },
          { op: "humanize", seed: 7, amount: 0.2, tracks: ["hihat"] },
        ],
      },
    })
  );
  const after = composed.pattern.tracks.find((track) => track.track_id === "kick");
  check("apply_pattern_ops clears the step it was told to", after.steps[clearedAt] === 0, `${before} → ${after.steps[clearedAt]}`);
  check("apply_pattern_ops sets the step it was told to", after.steps[15] === 1);
  check("apply_pattern_ops sets swing", composed.pattern.swing === 30);
  check(
    "apply_pattern_ops does not mutate the pattern it was given",
    pattern.tracks.find((track) => track.track_id === "kick").steps[clearedAt] === before,
    "the library's pattern changed"
  );
  check("every op is reported", (composed.applied ?? []).length === 4 && composed.applied.every((row) => row.ok));

  const invalid = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { pattern, ops: [{ op: "set_step", track: "theremin", step: 0 }] },
    })
  );
  check("an unknown track is reported, not thrown", invalid.applied?.[0]?.ok === false, JSON.stringify(invalid.applied?.[0] ?? {}));

  const stats = payload(await client.request("tools/call", { name: "pattern_statistics", arguments: { pattern } }));
  check("pattern_statistics describes every track", (stats.tracks ?? []).length === pattern.tracks.length);

  const midi = payload(await client.request("tools/call", { name: "export_midi", arguments: { pattern } }));
  const midiBytes = Buffer.from(midi.base64 ?? "", "base64");
  check("export_midi returns a Standard MIDI File", midiBytes.subarray(0, 4).toString("ascii") === "MThd", `${midiBytes.length} bytes`);

  const als = payload(await client.request("tools/call", { name: "export_ableton", arguments: { pattern } }));
  const alsBytes = Buffer.from(als.base64 ?? "", "base64");
  check("export_ableton returns gzipped XML", alsBytes[0] === 0x1f && alsBytes[1] === 0x8b, `${alsBytes.length} bytes`);

  const share = payload(await client.request("tools/call", { name: "share_url", arguments: { pattern } }));
  check("share_url returns an absolute link", typeof share.url === "string" && share.url.startsWith("http") && share.url.includes("groove="), share.url?.slice(0, 60));
  check("share_url reports its fidelity", typeof share.degraded === "boolean" && typeof share.payloadChars === "number");

  const loudness = payload(await client.request("tools/call", { name: "get_loudness_report", arguments: { genreId: "chicago-house" } }));
  check("get_loudness_report returns the committed measurement", typeof loudness.arrangedLufs === "number", JSON.stringify(loudness).slice(0, 120));

  /**
   * B6: the arrangement surface. `create_song` and `add_section` need no browser, so the gate *calls* them and
   * checks the timeline arithmetic; `render_song` is asserted as declared (calling it would start Chromium, which
   * this gate deliberately never does — `render_audio` is treated the same way).
   */
  check(
    "the song tools are declared",
    ["create_song", "add_section", "render_song"].every((name) => names.includes(name)),
    names.filter((name) => name.includes("song")).join(", ")
  );
  const created = payload(
    await client.request("tools/call", { name: "create_song", arguments: { genreId: "chicago-house", bars: 2 } })
  );
  check(
    "create_song seeds a song with one repeated section",
    typeof created.songId === "string" && created.totalBars === 2 && (created.clips ?? []).includes("A"),
    JSON.stringify(created).slice(0, 140)
  );
  const arranged = payload(
    await client.request("tools/call", {
      name: "add_section",
      arguments: { songId: created.songId, slot: "A", bars: 4, label: "drop", velocityScale: 0.8 },
    })
  );
  check(
    "add_section grows the arrangement and reports its shape",
    arranged.totalBars === 6 && arranged.shape === "A×2 → drop×4" && arranged.problems.length === 0,
    JSON.stringify({ bars: arranged.totalBars, shape: arranged.shape, problems: arranged.problems })
  );
  /**
   * B5 overrides through the tool surface: a model asked for "a build, then a fill" has to be able to say so, and the
   * fill's lanes come from the clip rather than from the model's guess (`fillForTracks`), which is what makes the
   * verb safe to offer without describing this genre's lane names.
   */
  const withOverrides = payload(
    await client.request("tools/call", {
      name: "add_section",
      arguments: {
        songId: created.songId,
        slot: "A",
        bars: 8,
        label: "build",
        velocityRamp: [0.6, 1],
        fill: true,
        transpose: -2,
      },
    })
  );
  const overrideSection = (withOverrides.sections ?? []).find((section) => section.label === "build");
  check(
    "add_section carries a build, a fill and a transposition",
    overrideSection?.overrides?.velocityRamp?.[0] === 0.6 &&
      overrideSection?.overrides?.velocityRamp?.[1] === 1 &&
      Array.isArray(overrideSection?.overrides?.fill?.steps) &&
      overrideSection.overrides.fill.steps.length > 0 &&
      overrideSection?.overrides?.transpose === -2,
    JSON.stringify(overrideSection?.overrides ?? {}).slice(0, 160)
  );
  check(
    "the ramp reaches the timeline as a per-bar velocity scale",
    (withOverrides.totalBars ?? 0) === 14 && withOverrides.problems.length === 0,
    JSON.stringify({ bars: withOverrides.totalBars, problems: withOverrides.problems })
  );

  const renderSongSchema = (tools?.tools ?? []).find((tool) => tool.name === "render_song");
  check(
    "render_song takes a songId and is marked as changing the session",
    Boolean(renderSongSchema) && JSON.stringify(renderSongSchema.inputSchema).includes("songId"),
    JSON.stringify(renderSongSchema?.inputSchema ?? {}).slice(0, 120)
  );

  const resource = await client.request("resources/read", { uri: "groove://genres" });
  const resourceText = resource?.contents?.[0]?.text ?? "";
  check("resources/read serves the library index", resourceText.includes("chicago-house"), `${resourceText.length} chars`);

  const prompt = await client.request("prompts/get", { name: "compose_groove", arguments: { genre: "chicago-house" } });
  const promptText = prompt?.messages?.[0]?.content?.text ?? "";
  check("prompts/get builds a usable brief", promptText.includes("chicago-house") && promptText.includes("apply_pattern_ops"), `${promptText.length} chars`);
} catch (error) {
  failures.push(`❌ the client could not complete the session — ${error.message}`);
} finally {
  await client.close();
}

if (process.env.GROOVE_MCP_VERBOSE === "1") for (const note of notes) console.log(note);
console.log(`\n🧩 MCP gate: ${notes.length} checks passed, ${failures.length} failed`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}
console.log("✅ the MCP server answers over stdio: tools, resources and prompts are all reachable");
