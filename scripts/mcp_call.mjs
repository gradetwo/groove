#!/usr/bin/env node
/**
 * Call one MCP tool from the shell.
 *
 * **Why this exists**: composing through the server is the only way to find the problems that matter — a tool whose
 * schema rejects a reasonable argument, a reply that omits what the next call needs, a render that takes minutes
 * where a preview would do. Doing that by hand means writing a stdio client each time, and a client written in a
 * hurry is where a real finding turns into "I could not get it to run".
 *
 * So: one command, the same protocol the gate uses, the reply printed as JSON.
 *
 * Usage:
 *   node scripts/mcp_call.mjs <tool> '<json arguments>' [--out <file>] [--json]
 *   node scripts/mcp_call.mjs --list
 *
 * `GROOVE_MCP_OUT` is set to a temporary directory unless the caller already set it, so a render has somewhere to
 * write and the reply's path is readable.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const argv = process.argv.slice(2);
const SERVER = path.join(process.cwd(), "dist-mcp", "groove-mcp.mjs");

if (!fs.existsSync(SERVER)) {
  console.error(`❌ ${SERVER} does not exist — run: npm run build:mcp`);
  process.exit(2);
}

const outIndex = argv.indexOf("--out");
const outFile = outIndex >= 0 ? argv[outIndex + 1] : undefined;
const scriptIndex = argv.indexOf("--script");
const scriptFile = scriptIndex >= 0 ? argv[scriptIndex + 1] : undefined;
const rawJson = argv.includes("--json");
/**
 * The `--out` and `--script` values are the only non-flag arguments that are not positional, and each is skipped **only when its flag is present**. The first version wrote `index !== outIndex + 1` unconditionally, so with no `--out` it dropped index 0 — the tool name — and called a tool named after the JSON string.
 */
const consumed = new Set([outIndex + 1, scriptIndex + 1].filter((index) => index > 0 && argv[index] !== undefined && !argv[index].startsWith("--")));
const positional = argv.filter((value, index) => !value.startsWith("--") && !consumed.has(index));
const [tool, argsText] = positional;

const outDir = process.env.GROOVE_MCP_OUT ?? fs.mkdtempSync(path.join(os.tmpdir(), "groove-mcp-call-"));
const child = spawn(process.execPath, [SERVER], {
  env: { ...process.env, GROOVE_MCP_OUT: outDir },
  stdio: ["pipe", "pipe", "pipe"],
});

let buffer = "";
const pending = new Map();
let nextId = 1;
child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let newline = buffer.indexOf("\n");
  while (newline >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    newline = buffer.indexOf("\n");
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    const resolve = pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  }
});
child.stderr.on("data", (chunk) => process.stderr.write(`  [server] ${chunk}`));

const request = (method, params) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} did not answer within 180s`));
      }
    }, 180_000);
  });

/** The server wraps a reply in `content[0].text`; the gate unwraps it the same way, so a caller sees the payload rather than the envelope. */
function payload(message) {
  const text = message?.result?.content?.[0]?.text;
  if (typeof text !== "string") return message?.result ?? message;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

try {
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "mcp_call", version: "1" },
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);

  /**
   * ⭐ **A flow runs in one session, because the server does not remember anything between processes.**
   *
   * Measured, and it cost three rounds of confusion: `create_song` answered with an id, the next invocation answered
   * `unknown songId`, and the reason is that every call here used to start its own server. Anything stateful —
   * create, set a tempo map, render, compare — cannot be expressed as separate commands at all. Muse's nine-movement
   * session worked because her client held one session open, which is the thing this file has to be able to do.
   *
   * `--script <file.json>` runs a list of calls in this one process:
   *
   * ```json
   * [{ "tool": "create_arrangement", "args": { "genreId": "chicago-house" } },
   * ```
   *
   * Each reply is printed under a heading naming its tool, so a caller can read the flow rather than infer it.
   */
  if (scriptFile) {
    const steps = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
    if (!Array.isArray(steps)) {
      console.error(`❌ ${scriptFile} must hold an array of { tool, args } steps`);
      process.exit(2);
    }
    /**
     * ⭐ **A step can name what the previous one returned, so a flow needs no hand-carried id.**
     *
     * `"songId": "$prev.songId"` reads the last step's reply. Without it a flow has to be run once to learn the id and
     * then edited to use it — which is how three attempts at measuring a tempo map turned into three failed calls
     * instead of one measurement.
     */
    let previous = undefined;
    const substitute = (value) => {
      if (typeof value === "string" && value.startsWith("$prev.")) {
        const path = value.slice("$prev.".length).split(".");
        return path.reduce((node, key) => (node === undefined || node === null ? undefined : node[key]), previous);
      }
      if (Array.isArray(value)) return value.map(substitute);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, substitute(inner)]));
      }
      return value;
    };
    for (const [index, step] of steps.entries()) {
      const stepReply = await request("tools/call", { name: step.tool, arguments: substitute(step.args ?? {}) });
      const stepResult = stepReply.error ? { error: stepReply.error } : payload(stepReply);
      previous = stepResult;
      console.log(`── ${index + 1}/${steps.length} ${step.tool}`);
      console.log(JSON.stringify(stepResult, null, 2));
    }
    process.exit(0);
  }

  if (tool === "--list" || tool === undefined) {
    const listed = await request("tools/list", {});
    const names = (listed.result?.tools ?? []).map((entry) => entry.name);
    console.log(names.join("\n"));
    process.exit(0);
  }

  let args = {};
  if (argsText) {
    try {
      args = JSON.parse(argsText);
    } catch (error) {
      console.error(`❌ the arguments are not JSON: ${error.message}`);
      process.exit(2);
    }
  }

  const reply = await request("tools/call", { name: tool, arguments: args });
  if (reply.error) {
    console.error(`❌ ${tool} failed: ${JSON.stringify(reply.error)}`);
    process.exit(1);
  }
  const result = payload(reply);
  const text = JSON.stringify(result, null, rawJson ? 0 : 2);
  if (outFile) {
    fs.writeFileSync(outFile, text);
    console.log(`wrote ${outFile} (${text.length} bytes) — output directory ${outDir}`);
  } else {
    console.log(text);
  }
} catch (error) {
  console.error(`❌ ${error.message}`);
  process.exit(1);
} finally {
  child.kill("SIGTERM");
}
