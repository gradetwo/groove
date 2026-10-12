/**
 * 📋 **What an MCP client actually sees**, printed rather than reasoned about.
 *
 * `docs/FEATURE_ALIGNMENT.md` has a column per surface, and the MCP column must be the real surface rather than a
 * grep over the registry sources — a regex over `name:`/`title:` pairs over-counts, because resources and prompts
 * carry the same fields (measured 2026-10-05: 98 pairs against 94 tools).
 *
 * So this starts the built server over stdio, asks `tools/list` exactly as a client would, and prints one
 * `name<TAB>title` line per tool. `npm run mcp:build` first if `dist-mcp/groove-mcp.mjs` is missing.
 *
 *   node scripts/list_mcp_tools.mjs            # one line per tool
 *   node scripts/list_mcp_tools.mjs --count    # just the number
 */
import { spawn } from "node:child_process";

const server = "dist-mcp/groove-mcp.mjs";
const child = spawn("node", [server], { stdio: ["pipe", "pipe", "inherit"] });
const send = (message) => child.stdin.write(JSON.stringify(message) + "\n");
let buffer = "";

send({
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "list_mcp_tools", version: "1" } },
});

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id === 1) {
      send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    }
    if (message.id === 2) {
      const tools = message.result?.tools ?? [];
      if (process.argv.includes("--count")) console.log(tools.length);
      else for (const tool of tools) console.log(`${tool.name}\t${tool.title ?? ""}`);
      child.kill();
      process.exit(0);
    }
  }
});

setTimeout(() => {
  console.error("the server did not answer tools/list within 60 s");
  child.kill();
  process.exit(1);
}, 60_000);
