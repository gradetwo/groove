/**
 * What a caller sends to a tool must come back whole, and a value the schema should refuse must be refused.
 *
 * ⭐ **The v1 half of this file went with the pattern tools.** The defect it pinned was specific to passing a whole v1
 * pattern through a tool argument: the MCP SDK parses a tool's arguments with the tool's own schema, Zod removes every
 * key the schema does not name, and a pattern's tracks carry fields the registry never declared — `syllables`, `laneId`,
 * `insert`, `trackLength`, `mute`, `phaseInvert`, a sampler's `sample` — so a caller got its own pattern back with
 * those fields silently gone. Nothing errored, which is what made it data loss rather than a rejected request.
 *
 * The arrangement surface is not that shape: a tool names an `arrangementId` and a `trackId` and the server edits the
 * model, so no whole pattern crosses the boundary and there is no passthrough left to lose. What is still worth
 * checking through the protocol is the other half of that contract — the fields a tool writes survive, and a value
 * outside the schema's range is refused rather than passed through.
 *
 * These tests go through the protocol with an in-memory transport on purpose. Calling a tool handler directly would
 * never fail here: the handler receives the arguments the SDK already parsed, so a schema that is too narrow or too
 * loose cannot be seen from that side. The parsing is the thing under test.
 */
import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../mcp/server";

type ToolResult = { content?: Array<{ type: string; text?: string }>; isError?: boolean };

/**
 * A whole MCP session in one process: the server the gate ships, a client, and a linked transport pair.
 *
 * `call` returns the JSON a tool put in its text block, so a test can assert on the document a caller receives
 * rather than on the object a handler still holds.
 */
async function withMcp<T>(
  run: (call: (name: string, args: Record<string, unknown>) => Promise<any>) => Promise<T>
): Promise<T> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "groove-schema-passthrough", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown>) => {
    const result = (await client.callTool({ name, arguments: args })) as ToolResult;
    const first = result.content?.[0];
    const text = first && first.type === "text" ? first.text ?? "" : "";
    if (result.isError) throw new Error(`${name} failed: ${text}`);
    return JSON.parse(text);
  };
  try {
    return await run(call);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("MCP · the tool boundary keeps what it is given", () => {
  it("an arrangement keeps the lyric it was given", async () => {
    await withMcp(async (call) => {
      const arrangement = await call("create_arrangement", { blankKind: "synth" });
      const trackId = String((arrangement.trackIds ?? [])[0] ?? "track-1");
      const sung = await call("set_arrangement_vocal_melody", {
        arrangementId: arrangement.arrangementId,
        trackId,
        syllables: ["能", "够"],
        tones: [2, 4],
        pitches: [60, 64],
      });
      expect(sung.syllables.filter(Boolean).map((record: any) => record.syllable)).toEqual(["能", "够"]);
      expect(sung.notes.map((note: any) => note.pitch)).toEqual([60, 64]);
      expect(sung.arrangementId).toBe(arrangement.arrangementId);
      expect(sung.trackId).toBe(trackId);
    });
  });

  it("still rejects a genuinely wrong value rather than passing it through", async () => {
    await withMcp(async (call) => {
      const arrangement = await call("create_arrangement", { blankKind: "synth" });
      const trackId = String((arrangement.trackIds ?? [])[0] ?? "track-1");
      /**
       * A pan outside −1…1 is a request to refuse, not a field to pass through. The schema is the only
       * place that can say so: by the time the handler runs, the value has already been accepted.
       */
      await expect(
        call("set_arrangement_track_pan", { arrangementId: arrangement.arrangementId, trackId, pan: 4 })
      ).rejects.toThrow(/pan|less than|invalid/i);
    });
  });
});
