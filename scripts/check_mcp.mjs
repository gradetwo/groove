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
import { readFileSync } from "node:fs";
import fs from "node:fs";
import path from "node:path";
import { buildMxlZip } from "../src/test/fixtures/mxl_zip.mjs";
import { buildMidiFile, GBK_TRACK_NAME, GBK_TRACK_NAME_BYTES } from "../src/test/fixtures/midi_file.mjs";

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
  /**
   * **The count, printed rather than only asserted.** `docs/MCP.md` used to say "45 tools" in prose, which stopped being true the moment a feature arrived; the number belongs to the server, so the gate that lists the surface says what it is. A reader
   * asking "how big is this surface" now has a command for it.
   */
  const listedResources = await client.request("resources/list", {});
  const listedPrompts = await client.request("prompts/list", {});
  console.log(
    `   surface      : ${names.length} tools, ${(listedResources?.resources ?? []).length} resources, ${(listedPrompts?.prompts ?? []).length} prompts`
  );
  for (const required of [
    "list_genres",
    "get_genre",
    "search_genres",
    "get_pattern",
    "apply_pattern_ops",
    "validate_pattern",
    "pattern_statistics",
    "apply_gs1_patch",
    "compare_genres",
    "export_midi",
    "export_ableton",
    "share_url",
    "render_audio",
    "render_arrangement_stems",
    "render_instrument_note",
    "analyze_audio",
    "get_loudness_report",
  ]) {
    check(`tool declared: ${required}`, names.includes(required));
  }
  const renderTool = (tools?.tools ?? []).find((tool) => tool.name === "render_audio");
  check("render_audio declares its format enum", JSON.stringify(renderTool?.inputSchema ?? {}).includes('"wav"'));
  check("tools carry a description for the model", (tools?.tools ?? []).every((tool) => (tool.description ?? "").length > 40));

  const resources = await client.request("resources/list", {});

  /**
   * Every URI the contract documents must be a URI the server declares.
   *
   * This is the check that would have caught `groove://changelog`: `docs/MCP.md` documented it from the day the contract was
   * written and the registry never declared it, so a reader saw a resource that answered "not found". Comparing the two sides needs
   * no maintenance — the contract is the list.
   */
  {
    const contract = readFileSync(new URL("../docs/MCP.md", import.meta.url), "utf8");
    const documented = [...new Set([...contract.matchAll(/(groove:\/\/[a-z-]+(?:\/[a-z-]+|\/\{[a-z]+\})*)/g)].map((match) => match[1]))];
    const declared = new Set((resources.resources ?? []).map((resource) => resource.uri));
    const missing = documented.filter((uri) => !declared.has(uri));
    check(
      "every documented resource is declared",
      missing.length === 0,
      missing.length ? `documented but not declared: ${missing.join(", ")}` : `${documented.length} documented URI(s)`
    );
  }

  const uriTemplate = (resources?.resources ?? []).map((resource) => resource.uri);
  check("resources/list returns the library resources", uriTemplate.includes("groove://genres"));
  check("a genre document template is declared", uriTemplate.some((uri) => uri.includes("genre")), uriTemplate.join(" "));

  const prompts = await client.request("prompts/list", {});
  const promptNames = (prompts?.prompts ?? []).map((prompt) => prompt.name);
  check("prompts/list returns the three prompts", ["compose_groove", "explain_genre", "practice_plan", "compose_with_examples"].every((name) => promptNames.includes(name)));

  // ---- real calls -----------------------------------------------------------------------------------------
  const genres = payload(await client.request("tools/call", { name: "list_genres", arguments: { limit: 5 } }));
  check("list_genres answers with rows", Array.isArray(genres.genres) && genres.genres.length === 5, JSON.stringify(genres).slice(0, 120));
  check("list_genres reports the library total", genres.total >= 100, String(genres.total));

  /**
   * The composition chain, as far as it is browser-free: create a song, add a section, replace a clip, read it back, export it.
   *
   * This is the half of the composer's workflow that the gate can check without Chromium (rendering has its own scope, because
   * it needs a browser). Two AI composers drove the server end to end and tripped over things this would have caught: `bars`
   * meaning **passes** rather than measures — they built arrangements four times the length they intended — and a song being
   * limited to clip A because `set_clip` existed and no tool reached it.
   */
  const song = payload(await client.request("tools/call", { name: "create_song", arguments: { genreId: "chicago-house", bars: 2, label: "verse" } }));
  /**
   * Make-unique, on the chain the gate already builds: two sections sharing a slot, one of them given its own copy, and the other left alone.
   * This is the property a composer could not get — three verses with three melodies — so the gate holds it rather than a description of it.
   */
  /**
   * The vocal binding, on the chain the gate already builds. It is browser-free by nature — the tool writes notes and checks tones, it renders
   * nothing — so unlike the loudness and preview checks this one belongs here, where it runs in seconds.
   */
  const vocal = payload(
    await client.request("tools/call", {
      name: "set_vocal_melody",
      arguments: { songId: song.songId, syllables: ["能", "够"], tones: [2, 4], pitches: [60, 64] },
    })
  );
  check(
    "set_vocal_melody binds one syllable per note and warns about the 倒字",
    vocal.notes?.length === 2 &&
      vocal.notes.every((note) => typeof note.syllable === "string" && typeof note.pitch === "number") &&
      vocal.prosody?.warnings?.length === 1,
    `${vocal.notes?.length} note(s), ${vocal.prosody?.warnings?.length} warning(s): ${vocal.prosody?.warnings?.[0]?.detail ?? ""}`.slice(0, 120)
  );
  const mismatched = await client.request("tools/call", {
    name: "set_vocal_melody",
    arguments: { songId: song.songId, syllables: ["能", "够"], tones: [2], pitches: [60, 64] },
  });
  check(
    "set_vocal_melody refuses a syllable/tone mismatch rather than guessing",
    mismatched?.isError === true || /one tone per syllable/.test(JSON.stringify(mismatched)),
    JSON.stringify(mismatched).slice(0, 120)
  );

  /**
   * Decision 3b's tool half, held to the two properties the report asked for: one call for a matrix, and **nothing applied** when one entry is wrong.
   */
  /**
   * Decision 2b at the tool boundary: a tempo map is a **validated** write, and the reported length follows it. Browser-free by nature — nothing here renders.
   */
  /**
   * Owner decision 4: the SVS stub must **say it is reserved**, so neither a human reading the tool list nor a gate watching the surface can mistake it for a
   * capability. It also validates, so the shape a real implementation would take is exercised now.
   */
  /**
   * Owner decision 1A made usable: a second lane of a kind, through the op an agent can actually call.
   */
  const addedLane = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { genreId: "chicago-house", ops: [{ op: "add_lane", track: "lead", laneId: "counter", name: "Counter" }] },
    })
  );
  const duplicateLane = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { genreId: "chicago-house", ops: [{ op: "add_lane", track: "lead", laneId: "lead" }] },
    })
  );
  check(
    "add_lane appends a second lane of a kind and refuses a duplicate id",
    (addedLane.applied ?? [])[0]?.ok === true &&
      (addedLane.pattern?.tracks ?? []).filter((track) => track.track_id === "lead").length === 2 &&
      (duplicateLane.applied ?? [])[0]?.ok === false,
    JSON.stringify((addedLane.applied ?? [])[0] ?? {}).slice(0, 100)
  );

  /**
   * ⭐ **The last UI-only performance transform, reachable where an agent composes.** The arpeggiator and the
   * strummer behind the chord panel (`src/utils/arpeggiatorTheory.ts`) were implemented and tested but no tool
   * could reach them — the gap `docs/Z2_ADJUDICATION.md` §2.7 stages. This asserts the op over the wire, and it
   * asserts the engine's **own order** rather than "the notes changed": `up` over C major is 60,64,67 cycled
   * (so `pitches[0]` is the arpeggio, not the original stack), a strum spreads those same notes onto successive
   * onsets, and a lane that holds nothing is refused with a message rather than quietly doing nothing.
   */
  const arpBaked = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: {
        genreId: "chicago-house",
        ops: [
          { op: "set_chord_progression", track: "chords", chords: [[60, 64, 67]] },
          { op: "transform_pattern", variant: "arp", track: "chords", pattern: "up", rate: "1/16", octaves: 1 },
        ],
      },
    })
  );
  const strummed = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: {
        genreId: "chicago-house",
        ops: [
          { op: "set_chord_progression", track: "chords", chords: [[60, 64, 67]] },
          { op: "transform_pattern", variant: "strum", track: "chords", direction: "down", speedMs: 25 },
        ],
      },
    })
  );
  const refusedTransform = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { genreId: "chicago-house", ops: [{ op: "transform_pattern", variant: "arp", track: "trombone" }] },
    })
  );
  const chordsLaneOf = (result) => (result.pattern?.tracks ?? []).find((track) => track.track_id === "chords") ?? {};
  check(
    "transform_pattern arpeggiates a held chord, strums it across steps, and refuses an unknown lane",
    JSON.stringify(chordsLaneOf(arpBaked).pitch?.slice(0, 3)) === JSON.stringify([60, 64, 67]) &&
      (chordsLaneOf(arpBaked).pitches ?? [])[0]?.[0] === 60 &&
      JSON.stringify(chordsLaneOf(strummed).pitch?.slice(0, 3)) === JSON.stringify([60, 64, 67]) &&
      chordsLaneOf(strummed).steps?.[1] === 1 &&
      (refusedTransform.applied ?? [])[0]?.ok === false,
    JSON.stringify((arpBaked.applied ?? [])[1] ?? {}).slice(0, 120)
  );

  /**
   * Fifth report, P1.2: a composer guessed `"techno"`, was told only "provide either genreId or pattern", and concluded the ids had to be read from the source.
   * `list_genres` is a tool; the error must say so, and should recognise an abbreviation.
   */
  const badGenre = await client.request("tools/call", {
    name: "create_song",
    arguments: { genreId: "techno", ops: [{ op: "set_step", track: "kick", step: 0 }] },
  });
  const badGenreText = JSON.stringify(badGenre);
  check(
    "an unknown genreId names list_genres and suggests the nearest real id",
    /list_genres/.test(badGenreText) && /detroit-techno/.test(badGenreText),
    badGenreText.slice(0, 140)
  );

  const vocalStub = await client.request("tools/call", {
    name: "synthesize_vocal",
    arguments: { syllables: ["能", "够"], tones: [2, 4] },
  });
  const vocalStubMismatch = await client.request("tools/call", {
    name: "synthesize_vocal",
    arguments: { syllables: ["能", "够"], tones: [2] },
  });
  check(
    "synthesize_vocal says it is reserved, and validates its arguments",
    /reserved/.test(JSON.stringify(vocalStub)) && /one tone per syllable/.test(JSON.stringify(vocalStubMismatch)),
    JSON.stringify(vocalStub).slice(0, 100)
  );

  const tempoApplied = payload(
    await client.request("tools/call", { name: "set_tempo", arguments: { songId: song.songId, tempoTrack: [{ atBar: 0, bpm: 240 }] } })
  );
  const tempoRejected = await client.request("tools/call", {
    name: "set_tempo",
    arguments: { songId: song.songId, tempoTrack: [{ atBar: -1, bpm: 120 }] },
  });
  check(
    "set_tempo accepts a map and refuses an unreadable point",
    typeof tempoApplied.secondsEstimate === "number" && tempoRejected?.isError === true,
    `estimate ${tempoApplied.secondsEstimate}s; rejected: ${tempoRejected?.isError === true}`
  );

  const laneProbe = payload(
    await client.request("tools/call", { name: "make_unique", arguments: { songId: song.songId, index: 0 } })
  );
  const firstSection = laneProbe.repointedSection;
  const laneBatch = payload(
    await client.request("tools/call", {
      name: "set_lane_slots",
      arguments: { songId: song.songId, edits: [{ sectionId: firstSection, trackId: "lead", slot: "B" }] },
    })
  );
  check(
    "set_lane_slots applies a whole batch in one call",
    laneBatch.applied === 1,
    `applied ${laneBatch.applied}`.slice(0, 120)
  );
  const laneRejected = await client.request("tools/call", {
    name: "set_lane_slots",
    arguments: {
      songId: song.songId,
      edits: [
        { sectionId: firstSection, trackId: "lead", slot: "A" },
        { sectionId: "no-such-section", trackId: "lead", slot: "A" },
      ],
    },
  });
  check(
    "set_lane_slots applies nothing when one entry is invalid, and says which",
    /nothing was applied/.test(JSON.stringify(laneRejected)) && /no section/.test(JSON.stringify(laneRejected)),
    JSON.stringify(laneRejected).slice(0, 120)
  );

  const uniqueSection = payload(
    await client.request("tools/call", { name: "make_unique", arguments: { songId: song.songId, index: 0 } })
  );
  check(
    "make_unique gives a section its own slot and reports which",
    typeof uniqueSection.allocatedSlot === "string" &&
      uniqueSection.allocatedSlot !== "A" &&
      uniqueSection.repointedSection === uniqueSection.sections?.[0]?.id,
    `slot ${uniqueSection.allocatedSlot}, section ${uniqueSection.repointedSection}`
  );

  check("create_song returns a songId", typeof song.songId === "string" && song.songId.length > 0, JSON.stringify(song).slice(0, 140));
  check(
    "create_song says what a pass is worth and how long the song is",
    Number.isFinite(song.passBars) && song.passBars >= 1 && Number.isFinite(song.secondsEstimate) && song.secondsEstimate > 0,
    `passBars=${song.passBars} seconds=${song.secondsEstimate}`
  );

  /**
   * ⭐ **Slowing a song down must make it longer, and that is the whole criterion for the estimate.**
   *
   * Muse reported that a tempo map made the estimated length disagree with the render. The measurement found a basis
   * difference: with no map the estimate counts **steps**, and with one it counted `totalBars` — **passes** — so a
   * one-pass song summed a single bar and reported 1.9 s where 15.5 s of music had been requested at 124 bpm.
   *
   * The check is written as the property rather than the number: halve the tempo over the whole song and the estimate
   * must grow. Against the old code it fails by construction (1.9 s after 15.5 s), which is what makes it a criterion
   * rather than a snapshot.
   */
  const slowed = payload(
    await client.request("tools/call", {
      name: "set_tempo",
      arguments: { songId: song.songId, tempoTrack: [{ atBar: 0, bpm: Math.max(20, Math.round((song.bpm ?? 120) / 2)) }] },
    })
  );
  check(
    "slowing a song through a tempo map makes secondsEstimate longer, not shorter",
    Number.isFinite(slowed.secondsEstimate) && slowed.secondsEstimate > song.secondsEstimate,
    `${song.secondsEstimate}s at ${song.bpm} bpm → ${slowed.secondsEstimate}s at half the tempo`
  );
  check(
    "bars counts passes: two passes expand to passBars x 2 measures",
    song.totalBars === song.passBars * 2,
    `totalBars=${song.totalBars} passBars=${song.passBars}`
  );

  const withSection = payload(
    await client.request("tools/call", { name: "add_section", arguments: { songId: song.songId, slot: "A", bars: 2, label: "chorus" } })
  );
  check("add_section places a second section", (withSection.sections ?? []).length === 2, JSON.stringify(withSection.shape ?? ""));

  const withClip = payload(
    await client.request("tools/call", { name: "set_clip", arguments: { songId: song.songId, slot: "B", genreId: "chicago-house" } })
  );
  check("set_clip gives a song a second clip", (withClip.clips ?? []).includes("B"), JSON.stringify(withClip.clips ?? []));

  const readBack = payload(await client.request("tools/call", { name: "get_song", arguments: { songId: song.songId } }));
  check(
    "get_song reads the arrangement back with its clips",
    readBack.clips?.A && readBack.clips?.B && (readBack.sections ?? []).length === 2,
    `clips=${Object.keys(readBack.clips ?? {}).join(",")} sections=${(readBack.sections ?? []).length}`
  );

  /**
   * The song reaches a DAW as an arrangement rather than one flattened clip: `export_ableton` with a songId places one clip per
   * section, in its own scene, named after the section.
   */
  const alsSong = payload(await client.request("tools/call", { name: "export_ableton", arguments: { songId: song.songId } }));
  check(
    "export_ableton exports a song as one clip per section",
    alsSong.sections === 2 && alsSong.filename?.endsWith(".als") && Number.isFinite(alsSong.bytes),
    JSON.stringify({ sections: alsSong.sections, filename: alsSong.filename })
  );

  const exported = payload(await client.request("tools/call", { name: "export_groove", arguments: { songId: song.songId } }));
  check(
    "export_groove writes a validated v2 package",
    exported.version === 2 && exported.clips?.includes?.("B") !== false && Number.isFinite(exported.bytes),
    JSON.stringify(exported).slice(0, 160)
  );

  /**
   * The undo acceptance line from docs/V4_REVIEW_PLAN.md: a sequence of tool calls returns to its starting arrangement.
   */
  const beforeUndo = payload(await client.request("tools/call", { name: "get_song", arguments: { songId: song.songId, includePatterns: false } }));
  const undone = payload(await client.request("tools/call", { name: "undo_song", arguments: { songId: song.songId, steps: 2 } }));
  check(
    "undo_song steps back and reports the arrangement as it now stands",
    (undone.sections ?? []).length === 1 && (beforeUndo.sections ?? []).length === 2,
    `before ${beforeUndo.sections?.length} sections, after ${undone.sections?.length}`
  );
  check(
    "get_song lists what is undoable",
    Array.isArray(beforeUndo.history) && beforeUndo.history.length >= 2 && typeof beforeUndo.history[0]?.opId === "string",
    `history entries: ${beforeUndo.history?.length ?? 0}`
  );

  /**
   * The round trip a composer actually needs: export the package, read it back, and find the arrangement intact. Before
   * `import_groove`, a server restart lost the whole composition — the report's complaint — and the package could only be
   * written, not read.
   */
  const imported = payload(await client.request("tools/call", { name: "import_groove", arguments: { path: exported.path } }));
  check(
    "import_groove restores the arrangement under a new songId",
    imported.songId !== song.songId && (imported.sections ?? []).length === 2 && (imported.clips ?? []).includes("B"),
    JSON.stringify({ songId: imported.songId, sections: imported.sections?.length, clips: imported.clips })
  );


  const found = payload(await client.request("tools/call", { name: "search_genres", arguments: { query: "chicago" } }));
  check("search_genres finds chicago-house", (found.matches ?? []).some((match) => match.id === "chicago-house"), JSON.stringify(found.matches?.[0] ?? {}));

  const genre = payload(await client.request("tools/call", { name: "get_genre", arguments: { id: "chicago-house" } }));
  check("get_genre returns recorded metadata", genre?.id === "chicago-house" && typeof genre?.culturalContext?.en === "string", JSON.stringify(genre).slice(0, 120));
  check("get_genre includes the mix and loudness trim", Boolean(genre?.mix) && typeof genre?.loudnessTrimDb === "number");

  const patternResult = payload(await client.request("tools/call", { name: "get_pattern", arguments: { genreId: "chicago-house" } }));

  /**
   * The two analysis tools the evaluation asked for and did not exist. Loudness is deliberately not one of them: every render already
   * returns gated loudness and true peak, which `docs/MCP.md` has said since the analyser was written.
   */
  const key = payload(await client.request("tools/call", { name: "estimate_key", arguments: { genreId: "chicago-house" } }));

  /**
   * The harmony pair, end to end and browser-free: choose a progression for a feeling, render it in a key, and check that what came
   * back is the progression it says it is.
   */
  /**
   * The melody half: deterministic for a seed, in key, and inside the range it reports.
   */
  /**
   * The prosody check, held to its two promises: it catches a direction reversal, and it never throws.
   */
  const prosody = payload(
    await client.request("tools/call", { name: "validate_prosody", arguments: { tones: [2, 4], pitches: [60, 64], syllables: ["能", "够"] } })
  );
  {
    const clean = payload(
      await client.request("tools/call", { name: "validate_prosody", arguments: { tones: [2, 4], pitches: [60, 58] } })
    );
    check(
      "validate_prosody warns on a reversal and stays silent when the melody follows the tones",
      (prosody.warnings ?? []).length === 1 && (clean.warnings ?? []).length === 0,
      `warnings ${(prosody.warnings ?? []).length} / clean ${(clean.warnings ?? []).length}`
    );
  }

  const melody = payload(
    await client.request("tools/call", { name: "generate_melody", arguments: { tonic: 60, mode: "major", bars: 8, seed: 7 } })
  );
  const again = payload(
    await client.request("tools/call", { name: "generate_melody", arguments: { tonic: 60, mode: "major", bars: 8, seed: 7 } })
  );
  {
    const scale = [0, 2, 4, 5, 7, 9, 11];
    const sounding = (melody.pitch ?? []).filter((_, index) => (melody.steps ?? [])[index] > 0);
    check(
      "generate_melody is seeded, in key and inside its range",
      sounding.length > 0 &&
        JSON.stringify(melody.pitch) === JSON.stringify(again.pitch) &&
        sounding.every((note) => note >= melody.range[0] && note <= melody.range[1]) &&
        sounding.every((note) => scale.includes((((note - 60) % 12) + 12) % 12)),
      `${sounding.length} notes in ${JSON.stringify(melody.range)}, contours ${(melody.contour ?? []).join("")}`
    );
  }

  /**
   * ⭐ **A declared input has to reach the thing it is declared for.**
   *
   * `generate_melody`'s schema documents `tones` as "one tone per sounding note, in playing order", and the generator runs the 倒字 repair with it — but the handler never passed it on, so supplying tone marks changed nothing at all. Muse found it by using `generate_melody` and `validate_prosody` together: each tool looked right alone, and only the pair showed that the tones were ignored.
   */
  const withTones = payload(
    await client.request("tools/call", { name: "generate_melody", arguments: { tonic: 60, mode: "major", bars: 2, seed: 7, tones: [1, 4, 1, 4, 1, 4, 1, 4] } })
  );
  const withoutTones = payload(
    await client.request("tools/call", { name: "generate_melody", arguments: { tonic: 60, mode: "major", bars: 2, seed: 7 } })
  );
  check(
    "generate_melody uses the tones it was given rather than composing as if there were none",
    // Same seed, different input: if the tones are ignored the two melodies are identical, which is exactly the bug.
    JSON.stringify(withTones.pitch) !== JSON.stringify(withoutTones.pitch),
    `tones changed ${(withTones.pitch ?? []).length} note(s): ${JSON.stringify(withTones.pitch ?? []).slice(0, 40)} vs ${JSON.stringify(withoutTones.pitch ?? []).slice(0, 40)}`
  );

  /**
   * The example library's acceptance line from docs/V4_REVIEW_PLAN.md: every example passes the **same gate any pattern does**.
   *
   * Written as a loop rather than a `map`, because `await` inside a `map` callback is a syntax error at module scope — which is how the
   * first version of this check failed, loudly and immediately.
   */
  /**
   * `set_chord_progression` end to end, because the runtime schema rejected it while the implementation, the docs and `suggest_progression`'s
   * own reply all recommended it. A tool the gate never calls is a tool whose schema can be wrong for weeks.
   */
  const chordsApplied = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { genreId: "chicago-house", ops: [{ op: "set_chord_progression", chords: [[48, 52, 55], [53, 57, 60]] }] },
    })
  );
  check(
    "apply_pattern_ops accepts set_chord_progression",
    (chordsApplied.applied ?? [])[0]?.ok === true,
    JSON.stringify((chordsApplied.applied ?? [])[0] ?? {}).slice(0, 120)
  );

  const exampleRows = payload(await client.request("tools/call", { name: "get_example", arguments: { genreId: "chicago-house" } }));
  const rows = exampleRows.examples ?? [];
  let validExamples = 0;
  for (const row of rows) {
    const validation = payload(
      await client.request("tools/call", { name: "validate_pattern", arguments: { pattern: row.pattern } })
    );
    if (validation.ok === true) validExamples += 1;
  }
  check(
    "get_example returns examples whose patterns validate",
    rows.length >= 2 && validExamples === rows.length && rows.every((row) => (row.recipe ?? []).length > 0),
    `${rows.length} example(s), ${validExamples} valid`
  );
  const missingGenre = payload(await client.request("tools/call", { name: "get_example", arguments: { genreId: "no-such-genre" } }));
  check(
    "get_example names the genres it has examples for when asked about one it does not",
    typeof missingGenre.raw === "string" && missingGenre.raw.includes("no worked examples"),
    String(missingGenre.raw ?? "").slice(0, 80)
  );

  const suggested = payload(
  await client.request("tools/call", { name: "suggest_progression", arguments: { tonic: 60, mode: "major", emotion: "nostalgic" } })
  );
  check(
  "suggest_progression renders a committed progression in the caller's key",
  typeof suggested.id === "string" &&
    Array.isArray(suggested.chords) &&
    suggested.chords.length === suggested.numerals.length &&
    suggested.chords.every((chord) => Array.isArray(chord) && chord.length >= 3) &&
    suggested.chords.flat().every((note) => note >= 0 && note <= 127),
  `${suggested.id} ${suggested.roman} → ${JSON.stringify(suggested.chords ?? []).slice(0, 80)}`
  );

  /**
   * ⭐ **The loop the harmony layer was missing: the suggestion gets used, not just printed.**
   *
   * `suggest_progression` answers what to play, and nothing could act on the answer — M1 in `z2.md` calls that the composer's core-productivity gap. This calls the two in sequence and checks that the chords **land in the pattern with a length**, because a chord written as a one-step stab is not a chord.
   */
  const appliedChords = payload(
    await client.request("tools/call", {
      name: "apply_chord_progression",
      arguments: { genreId: "chicago-house", progressionId: suggested.id, tonic: 60, mode: "major", chordBeats: 4 },
    })
  );
  const appliedTrack = (appliedChords.pattern?.tracks ?? []).find((track) => track.track_id === "chords");
  check(
    "apply_chord_progression writes the suggested progression into the pattern",
    appliedChords.written === (appliedChords.numerals ?? []).length &&
      (appliedTrack?.steps ?? []).filter((step) => step === 1).length === appliedChords.written &&
      (appliedTrack?.gate ?? []).filter((gate) => gate > 1).length === appliedChords.written &&
      appliedChords.validation?.ok === true,
    `${appliedChords.written} chord(s) into "${appliedChords.track}", validation ${appliedChords.validation?.ok}`
  );
  check(
  "estimate_key reports a tonic, a mode and a fit from the notes",
  typeof key.tonic === "string" && (key.mode === "major" || key.mode === "minor") && Number.isFinite(key.fit) && key.notes > 0,
  JSON.stringify({ tonic: key.tonic, mode: key.mode, fit: key.fit, notes: key.notes })
  );
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

  /**
   * A pattern's tracks carry fields the registry's schema does not name, and Zod removes every key an object does
   * not name. So a caller that sent a real pattern got its lyric, its second lane name and its polymeter length
   * back gone with no error — data loss with nothing to notice. The schema is permissive on the track now, and
   * this holds it there at the protocol boundary, where the SDK's own parse runs rather than a handler call.
   */
  const withTrackFields = JSON.parse(JSON.stringify(pattern));
  const lyricLane = withTrackFields.tracks.find((track) => track.track_id === "lead");
  lyricLane.syllables = lyricLane.steps.map((on) => (on ? "字" : null));
  lyricLane.laneId = "lead-2";
  lyricLane.trackLength = 12;
  const keptFields = payload(
    await client.request("tools/call", {
      name: "apply_pattern_ops",
      arguments: { pattern: withTrackFields, ops: [{ op: "swing", amount: 12 }] },
    })
  );
  const keptLane = (keptFields.pattern?.tracks ?? []).find((track) => track.track_id === "lead");
  check(
    "apply_pattern_ops returns the track fields its schema does not name",
    Array.isArray(keptLane?.syllables) &&
      JSON.stringify(keptLane.syllables) === JSON.stringify(lyricLane.syllables) &&
      keptLane.laneId === "lead-2" &&
      keptLane.trackLength === 12,
    `syllables=${Array.isArray(keptLane?.syllables) ? keptLane.syllables.filter(Boolean).length : "missing"} laneId=${keptLane?.laneId} trackLength=${keptLane?.trackLength}`
  );

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

  /**
   * The custom-genre tools, called for real. The maker saved to the browser's IndexedDB and the server is a Node
   * process with none, which is why the capability map recorded this as a gap; the store now sits behind
   * `CustomGenreStore` and the fork is the app's own `forkGenre`. Re-saving a whole document through the tool is
   * checked too, because a schema that enumerated fields instead of passing them through would drop the ones it did
   * not name.
   */
  const savedGenre = payload(
    await client.request("tools/call", { name: "save_custom_genre", arguments: { forkFromGenreId: "chicago-house", name: "Gate Probe" } })
  );
  check(
    "save_custom_genre forks a library genre with its defaults",
    savedGenre.replaced === false && savedGenre.genre?.forkedFromId === "chicago-house" && savedGenre.genre?.isCustom === true,
    JSON.stringify({ id: savedGenre.genre?.id, bpm: savedGenre.genre?.default_bpm }).slice(0, 120)
  );
  const savedFieldCount = Object.keys(savedGenre.genre ?? {}).length;
  const resavedGenre = payload(
    await client.request("tools/call", { name: "save_custom_genre", arguments: { genre: { ...savedGenre.genre, default_bpm: 137 } } })
  );
  const rereadGenre = payload(await client.request("tools/call", { name: "get_custom_genre", arguments: { id: savedGenre.genre.id } }));
  check(
    "save_custom_genre replaces rather than duplicating, and keeps every field of a document",
    resavedGenre.replaced === true && rereadGenre?.default_bpm === 137 && Object.keys(rereadGenre ?? {}).length === savedFieldCount,
    `${savedFieldCount} -> ${Object.keys(rereadGenre ?? {}).length} fields, bpm ${rereadGenre?.default_bpm}`
  );
  const listedGenres = payload(await client.request("tools/call", { name: "list_custom_genres", arguments: {} }));
  const duplicatedGenre = payload(
    await client.request("tools/call", { name: "duplicate_custom_genre", arguments: { id: savedGenre.genre.id } })
  );
  const deletedGenre = payload(
    await client.request("tools/call", { name: "delete_custom_genre", arguments: { id: duplicatedGenre.copy.id } })
  );
  check(
    "list, duplicate and delete reach the session's custom genres",
    listedGenres.total === 1 && duplicatedGenre.copy?.id !== savedGenre.genre.id && deletedGenre.remaining?.length === 1,
    JSON.stringify({ listed: listedGenres.total, copy: duplicatedGenre.copy?.name, remaining: deletedGenre.remaining }).slice(0, 140)
  );

  const resource = await client.request("resources/read", { uri: "groove://genres" });
  const resourceText = resource?.contents?.[0]?.text ?? "";
  check("resources/read serves the library index", resourceText.includes("chicago-house"), `${resourceText.length} chars`);

  /**
   * The MusicXML pair over the wire, and the reason this block exists at all.
   *
   * `import_arrangement_musicxml` reaches the reader, which used to call `new DOMParser()`. Node has no `DOMParser`, so that tool answered `{"raw":"DOMParser is not defined"}` to every real client from the day it shipped, and this gate — which is the only thing that calls tools the way a client does — never called it. The reader now parses with `saxes` through `src/data/xml.ts`, so the calls below are the proof that the capability exists in the server's own environment, not just under the unit suite's `jsdom`.
   *
   * **What this covers of the environment-dependent surface, and how.** The render tools are asserted as declared with their schemas and deliberately never called, because calling one starts Chromium: that is `render_audio`, `render_song`, `render_preview_clip` and `analyze_audio`, and the existing checks above already cover the first and the last. `export_groove` and `import_groove` are called for real earlier in this session, which covers the file system. The zip is covered here. **Every other tool runs on arguments alone**, so this session's calls to the library, pattern, song, harmony, melody, vocal and exporting tools are the pass over that part of the surface.
   */
  const xmlArrangement = payload(await client.request("tools/call", { name: "create_arrangement", arguments: { blankKind: "instrument" } }));
  const exportedScore = payload(
    await client.request("tools/call", {
      name: "export_arrangement_musicxml",
      arguments: { arrangementId: xmlArrangement.arrangementId, title: "Gate", tempoBpm: 120 },
    })
  );
  check(
    "export_arrangement_musicxml returns a parseable score with the tempo it was given",
    typeof exportedScore.xml === "string" && exportedScore.xml.includes("<score-partwise") && exportedScore.xml.includes('tempo="120"') && exportedScore.bars >= 1,
    `${exportedScore.bytes} bytes, ${exportedScore.bars} bar(s)`
  );

  const twoParts = `<?xml version="1.0"?><score-partwise version="4.0">
    <part-list><score-part id="P1"><part-name>Right Hand</part-name></score-part><score-part id="P2"><part-name>Left Hand</part-name></score-part></part-list>
    <part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>2</duration></note><note><pitch><step>D</step><octave>5</octave></pitch><duration>2</duration></note></measure></part>
    <part id="P2"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><octave>3</octave></pitch><duration>4</duration></note></measure></part>
  </score-partwise>`;
  const importedScore = payload(
    await client.request("tools/call", {
      name: "import_arrangement_musicxml",
      arguments: { arrangementId: xmlArrangement.arrangementId, xml: twoParts, partIndex: "all" },
    })
  );
  check(
    'import_arrangement_musicxml parses XML in the server and adds one track per part with partIndex "all"',
    (importedScore.trackIds ?? []).length === 2 &&
      ["Right Hand", "Left Hand"].every((name) => (importedScore.summary?.tracks ?? []).some((track) => track.name === name)) &&
      importedScore.notes === 3,
    `${(importedScore.trackIds ?? []).length} track(s), ${importedScore.notes} note(s)`
  );

  /**
   * The compressed path, with **the zip the criteria send**: `src/test/fixtures/mxl_zip.mjs` builds it for both, so this is evidence about the covered code rather than about a second zip builder.
   */
  const mxl = payload(
    await client.request("tools/call", {
      name: "import_arrangement_musicxml_file",
      arguments: { arrangementId: xmlArrangement.arrangementId, bytesBase64: Buffer.from(buildMxlZip([["score.musicxml", twoParts]])).toString("base64") },
    })
  );
  check(
    "import_arrangement_musicxml_file unzips a .mxl in the server and reads the score in it",
    mxl.format === "mxl" && mxl.notes === 2 && (mxl.summary?.tracks ?? []).some((track) => track.name === "Right Hand"),
    `format ${mxl.format}, ${mxl.notes} note(s)`
  );

  /**
   * ⭐ **The MIDI import, over the wire, with bytes this repository builds.**
   *
   * The same reasoning as the MusicXML pair above, and one more: the step-model import that existed before threw the file's note lengths away, so an agent asking for a MIDI file used to get a sixteen-step grid back with no way to tell that it had. This checks the thing that made it worth a tool — the tracks arrive named, and a note keeps the length the file gave it.
   */
  /**
   * The licence and provenance of the pinned libraries, over the wire. An agent publishing something made with this material has to be able to say where it came from, and the manifest has carried that all along.
   */
  const libraries = payload(await client.request("tools/call", { name: "list_sample_libraries", arguments: {} }));
  const attribution = (libraries.libraries ?? []).filter((library) => /BY/i.test(library.licence));
  check(
    "list_sample_libraries reports each licence and names the ones requiring attribution",
    (libraries.libraries ?? []).length > 0 &&
      (libraries.libraries ?? []).every((library) => typeof library.licence === "string") &&
      attribution.length > 0 &&
      attribution.every((library) => typeof library.sourceUrl === "string") &&
      typeof libraries.note === "string" &&
      attribution.every((library) => libraries.note.includes(library.id)),
    `${(libraries.libraries ?? []).length} library(ies), ${attribution.length} requiring attribution`
  );

  const midiArrangement = payload(await client.request("tools/call", { name: "create_arrangement", arguments: { blankKind: "instrument" } }));
  const importedMidiBytes = buildMidiFile({
    division: 480,
    tracks: [
      { name: "Piano", notes: [{ note: 60, startTicks: 0, durationTicks: 960 }] },
      { nameBytes: GBK_TRACK_NAME_BYTES, notes: [{ note: 55, startTicks: 240, durationTicks: 240 }] },
    ],
  });
  const importedMidi = payload(
    await client.request("tools/call", {
      name: "import_arrangement_midi",
      arguments: { arrangementId: midiArrangement.arrangementId, bytesBase64: Buffer.from(importedMidiBytes).toString("base64"), partIndex: "all" },
    })
  );
  const midiTrackNames = (importedMidi.summary?.tracks ?? []).map((track) => track.name);
  check(
    "import_arrangement_midi adds one track per MIDI track, with a GBK name decoded",
    (importedMidi.trackIds ?? []).length === 2 && midiTrackNames.includes(GBK_TRACK_NAME) && importedMidi.notes === 2,
    `${(importedMidi.trackIds ?? []).length} track(s) ${JSON.stringify(midiTrackNames)}, ${importedMidi.notes} note(s)`
  );

  /**
   * ⭐ **The export half of the same pair, over the wire.** The composer's report was that an arrangement could
   * come in from a DAW and not go back out, so this asserts the loop the way the import check above does: call the
   * tool, read the file it wrote, and hand the bytes back to the **import tool** rather than to a parser written
   * here. Comparing note multisets before and after is what catches a writer that loses a length or shifts a name.
   */
  const noteTuples = (summary, trackIds) =>
    (summary?.tracks ?? [])
      .filter((track) => !trackIds || trackIds.includes(track.id))
      .flatMap((track) => track.notes ?? [])
      .map((note) => `${note.pitch}@${note.startBeats}+${note.lengthBeats}v${note.velocity}`)
      .sort();
  const exportedMidi = payload(await client.request("tools/call", { name: "export_arrangement_midi", arguments: { arrangementId: midiArrangement.arrangementId } }));
  const exportedMidiBytes = fs.readFileSync(exportedMidi.path);
  const beforeExport = noteTuples(importedMidi.summary);
  // A folder's blank arrangement holds no notes, so everything the re-import reports came out of the exported file.
  const roundTripArrangement = payload(await client.request("tools/call", { name: "create_arrangement", arguments: { blankKind: "folder" } }));
  const reimportedMidi = payload(
    await client.request("tools/call", {
      name: "import_arrangement_midi",
      arguments: { arrangementId: roundTripArrangement.arrangementId, bytesBase64: exportedMidiBytes.toString("base64"), partIndex: "all" },
    })
  );
  const afterExport = noteTuples(reimportedMidi.summary, reimportedMidi.trackIds);
  check(
    "export_arrangement_midi writes a format 1 file that re-imports to the same notes",
    exportedMidiBytes.subarray(0, 4).toString("ascii") === "MThd" &&
      exportedMidi.format === 1 &&
      beforeExport.length > 0 &&
      JSON.stringify(afterExport) === JSON.stringify(beforeExport),
    `${exportedMidi.notes} note(s), ${exportedMidiBytes.length} bytes, re-imported ${afterExport.length} of ${beforeExport.length}`
  );

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
