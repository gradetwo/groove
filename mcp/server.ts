#!/usr/bin/env node
/**
 * Groove Lab MCP server (stdio).
 *
 * Build it with `npm run mcp:build` (esbuild → `dist-mcp/groove-mcp.mjs`), run it with `npm run mcp`, or point an
 * MCP client's `command` at the bundle. See `docs/MCP.md` for the surface and `mcp/README.md` for client config.
 *
 * The split of concerns is deliberate: this file only wires the registry to the protocol. The tools themselves
 * are plain functions with unit tests (`src/test/mcpTools.test.ts`), which is why a tool can be tested without
 * starting a server and the server can be smoke-tested without a browser.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { RequestHandlerExtra } from "@modelcontextprotocol/sdk/shared/protocol.js";
import type { ServerNotification, ServerRequest } from "@modelcontextprotocol/sdk/types.js";
import { PROMPTS, RESOURCES, TOOLS, failure, json } from "./registry";
import { installRendererLifecycle } from "./render/worker";
import { createRenderProgress } from "./render/progress";

const VERSION = process.env.GROOVE_MCP_VERSION || "1.0.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "groove-lab", version: VERSION },
    {
      instructions: [
        "Groove Lab is a genre library and drum-machine studio: 159 genres with their real patterns, a sequencer,",
        "exporters (WAV/MP3/MIDI/Ableton) and audio measurement.",
        "",
        "Typical flow: search_genres or list_genres → get_genre (the recorded facts) → get_pattern (what it plays)",
        "→ apply_pattern_ops (compose) → render_audio and/or share_url (hand it to a human).",
        "",
        "Everything except render_audio runs without a browser. The library is read-only: apply_pattern_ops returns a",
        "new pattern and never edits a genre.",
      ].join("\n"),
    }
  );

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: {
          readOnlyHint: tool.readOnly,
          // The one tool that writes a file: destructive only in the sense that it creates one.
          destructiveHint: !tool.readOnly,
          openWorldHint: false,
        },
      },
      async (args: Record<string, unknown>, extra: RequestHandlerExtra<ServerRequest, ServerNotification>) => {
        try {
          /**
           * **Progress exists only because the caller asked for it.**
           *
           * MCP carries the opt-in in the request's `_meta.progressToken` and the SDK hands the handler the whole
           * `extra` — token, and a `sendNotification` bound to *this* request. `createRenderProgress` is what turns
           * those two into a reporter, and it returns `undefined` when there is no token, so a handler cannot
           * accidentally narrate a request nobody asked about. The token is echoed back in every notification, which
           * is how a client with several calls in flight tells them apart.
           *
           * This is not a courtesy: a client that sees `notifications/progress` does not treat a long render as a
           * hang, and the SDK's own client resets its request timeout on progress when it is configured to
           * (`resetTimeoutOnProgress`), which is the mechanism that lets a 445-511 s eight-bar render survive a
           * timeout the caller set for short calls.
           */
          const progress = createRenderProgress(extra?._meta?.progressToken, (token, value, total, message) => {
            void extra
              .sendNotification({
                method: "notifications/progress",
                params: {
                  progressToken: token,
                  progress: value,
                  ...(total !== undefined ? { total } : {}),
                  message,
                },
              })
              .catch(() => {
                // A disconnected client is not a failed render: the work still finishes and the result is still written.
              });
          });
          const context = { ...(progress ? { progress } : {}) };
          const result = await tool.handler(args ?? {}, context);
          // Handlers may return a ready-made MCP result (a failure) or plain data.
          if (result && typeof result === "object" && "content" in (result as Record<string, unknown>)) {
            return result as { content: Array<{ type: "text"; text: string }> };
          }
          return json(result);
        } catch (error) {
          return failure(`${tool.name} failed: ${(error as Error).message}`);
        }
      }
    );
  }

  for (const resource of RESOURCES) {
    server.registerResource(
      resource.name,
      resource.uri,
      { title: resource.name, description: resource.description, mimeType: resource.mimeType },
      async (uri: URL) => {
        // `groove://genre/{id}` carries its id in the path; fixed resources ignore it.
        const id = uri.pathname?.replace(/^\//, "") || uri.hostname;
        return { contents: [{ uri: uri.href, mimeType: resource.mimeType, text: resource.read(id) }] };
      }
    );
  }

  for (const prompt of PROMPTS) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
        argsSchema: Object.fromEntries(
          prompt.arguments.map((argument) => [
            argument.name,
            argument.required
              ? z.string().describe(argument.description)
              : z.string().optional().describe(argument.description),
          ])
        ),
      },
      (args) => ({
        messages: [
          {
            role: "user" as const,
            content: { type: "text" as const, text: prompt.build((args ?? {}) as Record<string, string>) },
          },
        ],
      })
    );
  }

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  /**
   * Close the browser and the dev server on every path this process can leave by — client disconnect, signal, and a
   * synchronous last resort for the Vite child. The reasoning, and the measurement that made it necessary, are in
   * `installRendererLifecycle`.
   *
   * Installed here rather than at module scope **on purpose**: `createServer` is imported by
   * `src/test/mcpSchemaPassthrough.test.ts`, and a module-scope `stdin` `end` listener would let a test run's own
   * stdin closing exit the test process.
   */
  installRendererLifecycle();
  await server.connect(transport);
  // Never write to stdout: it is the protocol channel. Diagnostics go to stderr.
  console.error(`groove-lab MCP server ready (${TOOLS.length} tools, ${RESOURCES.length} resources, ${PROMPTS.length} prompts)`);
}

const isEntryPoint = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isEntryPoint || process.env.GROOVE_MCP_FORCE_MAIN === "1") {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
