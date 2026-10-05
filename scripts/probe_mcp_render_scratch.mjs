#!/usr/bin/env node
/**
 * Scratch probe: drive the built MCP server over stdio and time individual tool calls.
 *
 * Not a gate — a measurement harness used while reproducing the three owner-reported defects
 * (`render_arrangement` without `headless` never answering, the headless path's speed, and
 * `inspect_instrument_sfz`'s arguments). Every number it prints is a wall-clock reading taken
 * on the machine it ran on, at the moment it ran.
 *
 *   node scripts/probe_mcp_render.py.mjs --tool=render_arrangement --bars=2 --timeout=60000
 *   node scripts/probe_mcp_render.py.mjs --tool=render_arrangement --bars=2 --headless --timeout=180000
 *   node scripts/probe_mcp_render.py.mjs --script=inspect
 */
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { performance } from "node:perf_hooks";

const ROOT = process.cwd();
const BUNDLE = path.join(ROOT, "dist-mcp", "groove-mcp.mjs");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...rest] = a.replace(/^--/, "").split("=");
    return [k, rest.length ? rest.join("=") : true];
  })
);

class Client {
  constructor() {
    this.child = spawn(process.execPath, [BUNDLE], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GROOVE_MCP_OUT: process.env.GROOVE_MCP_OUT || "/tmp/mcp-probe-out" },
    });
    this.buffer = "";
    this.pending = new Map();
    this.nextId = 1;
    this.stderr = "";
    this.notifications = [];
    this.t0 = performance.now();
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
          this.log(`UNPARSED STDOUT: ${line.slice(0, 200)}`);
          continue;
        }
        if (message.id !== undefined && this.pending.has(message.id)) {
          const entry = this.pending.get(message.id);
          this.pending.delete(message.id);
          entry(message);
        } else if (message.method) {
          this.notifications.push({ at: this.now(), message });
          const p = message.params ?? {};
          const note = p.progress !== undefined ? `${p.progress}/${p.total ?? "?"} ${p.message ?? ""}` : JSON.stringify(p).slice(0, 200);
          this.log(`NOTIFY ${message.method} @${Math.round(this.now())}ms :: ${note}`);
        }
      }
    });
    this.child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      this.stderr += text;
      for (const line of text.split("\n")) if (line.trim()) this.log(`STDERR ${line.trim()}`);
    });
  }

  now() {
    return performance.now() - this.t0;
  }

  log(line) {
    console.log(`[${(this.now() / 1000).toFixed(2)}s] ${line}`);
  }

  request(method, params, timeoutMs = 30000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
    return new Promise((resolve, reject) => {
      const started = this.now();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${timeoutMs}ms (no reply)`));
      }, timeoutMs);
      this.pending.set(id, (message) => {
        clearTimeout(timer);
        const elapsed = this.now() - started;
        if (message.error) reject(new Error(`${method}: ${message.error.message} [${Math.round(elapsed)}ms]`));
        else resolve({ result: message.result, elapsedMs: elapsed });
      });
      this.child.stdin.write(payload);
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async close() {
    this.child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

const payload = (result) => {
  const text = result?.content?.[0]?.text ?? "";
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
};

function brief(value, max = 700) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}… (+${text.length - max} chars)` : text;
}

const client = new Client();
const t = performance.now();
try {
  fs.mkdirSync(process.env.GROOVE_MCP_OUT || "/tmp/mcp-probe-out", { recursive: true });
  await client.request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "probe", version: "1.0.0" },
  });
  client.notify("notifications/initialized", {});

  const script = args.script;

  if (script === "call") {
    const tool = String(args.tool);
    const callArgs = args.args ? JSON.parse(String(args.args)) : {};
    const started = performance.now();
    const res = await client.request("tools/call", { name: tool, arguments: callArgs }, Number(args.timeout ?? 120000));
    console.log(`${tool} (${Math.round(performance.now() - started)}ms):`);
    console.log(brief(payload(res.result), Number(args.max ?? 4000)));
  } else if (script === "inspect") {
    const libs = await client.request("tools/call", { name: "list_sample_libraries", arguments: {} }, 60000);
    const body = payload(libs.result);
    console.log(`list_sample_libraries (${Math.round(libs.elapsedMs)}ms):`);
    console.log(brief(body, 3000));
    const urls = [];
    const collect = (node) => {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) return node.forEach(collect);
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string" && /\.sfz(\?|$)/i.test(v)) urls.push({ key: k, url: v });
        else if (typeof v === "object") collect(v);
      }
    };
    collect(body);
    console.log(`\nSFZ urls found: ${urls.length}`);
    for (const u of urls.slice(0, 6)) console.log(`  ${u.key} = ${u.url}`);

    if (urls.length) {
      const target = urls.find((u) => /sw_|keyswitch|vsco|$/.test(u.key)) ?? urls[0];
      console.log(`\n--- inspect_instrument_sfz with url=${target.url} ---`);
      const started = performance.now();
      try {
        const res = await client.request(
          "tools/call",
          { name: "inspect_instrument_sfz", arguments: { url: target.url } },
          180000
        );
        const out = payload(res.result);
        console.log(`elapsed ${Math.round(performance.now() - started)}ms`);
        if (out.rows) {
          console.log(`assetId=${out.assetId} regions=${out.regions} missing=${JSON.stringify(out.missing)}`);
          console.log("sw_* / switch rows:");
          console.log(JSON.stringify(out.rows.filter((r) => /^sw_|switch/i.test(r.opcode)), null, 1));
        } else {
          console.log(brief(out, 2000));
        }
      } catch (error) {
        console.log(`inspect failed: ${error.message}`);
      }
    }

    console.log(`\n--- inspect_instrument_sfz with a NAME (should be refused or accepted) ---`);
    const byName = await client
      .request("tools/call", { name: "inspect_instrument_sfz", arguments: { url: "vsco2ce-violin" } }, 60000)
      .then((r) => payload(r.result))
      .catch((e) => ({ threw: e.message }));
    console.log(brief(byName, 1200));
  } else {
    const bars = Number(args.bars ?? 2);
    const genre = String(args.genre ?? "chicago-house");
    const created = await client.request(
      "tools/call",
      { name: "create_arrangement", arguments: { genreId: genre, blankKind: "synth" } },
      60000
    );
    const arrangement = payload(created.result);
    console.log(`create_arrangement (${Math.round(created.elapsedMs)}ms): ${brief(arrangement, 500)}`);
    const arrangementId = arrangement.arrangementId ?? arrangement.id;
    if (!arrangementId) throw new Error("no arrangementId in create_arrangement reply");
    // ⭐ **Creation does not set the length**, so the probe asks for the bars the caller named.
    await client.request("tools/call", { name: "set_arrangement_bars", arguments: { arrangementId, bars } }, 60000);

    const callArgs = { arrangementId, format: "wav", maxDurationSec: 1800 };
    if (args.headless) callArgs.headless = true;
    if (args.sampleRate) callArgs.sampleRate = Number(args.sampleRate);
    if (args.channels) callArgs.channels = Number(args.channels);
    const timeoutMs = Number(args.timeout ?? 60000);
    console.log(
      `\n--- render_arrangement ${JSON.stringify({ ...callArgs, arrangementId: "<id>" })} ceiling=${timeoutMs}ms ---`
    );
    const started = performance.now();
    try {
      const res = await client.request(
        "tools/call",
        args.progress
          ? { name: "render_arrangement", arguments: callArgs, _meta: { progressToken: `probe-${Date.now()}` } }
          : { name: "render_arrangement", arguments: callArgs },
        timeoutMs
      );
      const out = payload(res.result);
      console.log(`RETURNED in ${Math.round(performance.now() - started)}ms`);
      console.log(brief(out, 1500));
    } catch (error) {
      console.log(`NO REPLY: ${error.message} after ${Math.round(performance.now() - started)}ms`);
    }
  }
} finally {
  console.log(`\ntotal wall ${Math.round(performance.now() - t)}ms`);
  console.log(`--- server stderr (${client.stderr.length} chars) ---`);
  console.log(client.stderr.slice(-4000));
  await client.close();
}
