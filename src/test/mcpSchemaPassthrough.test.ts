/**
 * What a caller sends to a pattern tool must come back whole.
 *
 * The MCP SDK parses a tool's arguments with the tool's own schema, and Zod removes every key an object does not
 * name. A pattern's tracks carry fields the rest of the app already writes and reads — `syllables`, `laneId`,
 * `insert`, `trackLength`, `mute`, `phaseInvert` — and the registry names only some of them, so a caller that
 * sends a real pattern gets one back with those fields silently gone. Nothing errors, which is what makes it data
 * loss rather than a rejected request.
 *
 * These tests go through the protocol with an in-memory transport on purpose. Calling a tool handler directly
 * would never fail here: the handler receives the arguments the SDK already parsed, so a schema that is too narrow
 * cannot be seen from that side. The parsing is the defect.
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

describe("MCP · a pattern's own fields survive the tool boundary", () => {
  it("keeps the undeclared fields a real pattern carries on an apply_pattern_ops round trip", async () => {
    await withMcp(async (call) => {
      const { pattern } = await call("get_pattern", { genreId: "chicago-house" });
      const lead = pattern.tracks.find((track: any) => track.track_id === "lead");
      const kick = pattern.tracks.find((track: any) => track.track_id === "kick");

      // Written the way the app writes them: a lyric per step, a second lane name, the insert chain, a
      // polymeter length, the two mix flags, the polarity flip and an audio lane's sample.
      lead.syllables = lead.steps.map((on: number, index: number) => (on ? `字${index}` : null));
      lead.laneId = "lead-2";
      lead.insert = { highPassHz: 80 };
      kick.trackLength = 12;
      kick.mute = true;
      kick.solo = true;
      kick.phaseInvert = true;
      kick.sample = { assetId: "vcsl:cello-sustain" };

      const composed = await call("apply_pattern_ops", { pattern, ops: [{ op: "swing", amount: 30 }] });
      const outLead = composed.pattern.tracks.find((track: any) => track.track_id === "lead");
      const outKick = composed.pattern.tracks.find((track: any) => track.track_id === "kick");

      expect(outLead.syllables).toEqual(lead.syllables);
      expect(outLead.laneId).toBe("lead-2");
      expect(outLead.insert).toEqual({ highPassHz: 80 });
      expect(outKick.trackLength).toBe(12);
      expect(outKick.mute).toBe(true);
      expect(outKick.solo).toBe(true);
      expect(outKick.phaseInvert).toBe(true);
      expect(outKick.sample).toEqual({ assetId: "vcsl:cello-sustain" });
    });
  });

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
  });

  it("keeps every top-level and per-track key of a pattern the app itself produces", async () => {
    await withMcp(async (call) => {
      // ⭐ The app's own genre seeding, taken through `get_pattern`, rather than a pattern written here.
      const read = await call("get_pattern", { genreId: "chicago-house" });
      const clip = read.pattern;
      expect(Object.keys(clip).length).toBeGreaterThan(3);

      const composed = await call("apply_pattern_ops", { pattern: clip, ops: [{ op: "swing", amount: 10 }] });
      const returned = composed.pattern;

      expect(Object.keys(returned).sort()).toEqual(Object.keys(clip).sort());
      expect(returned.tracks.length).toBe(clip.tracks.length);
      for (const track of clip.tracks) {
        const after = returned.tracks.find((candidate: any) => candidate.track_id === track.track_id && candidate.laneId === track.laneId);
        expect(after, track.track_id).toBeTruthy();
        expect(Object.keys(after).sort(), track.track_id).toEqual(Object.keys(track).sort());
      }
      // The values behind the key sets too: `trackLength` is a real arranged-pattern field the schema does not name.
      expect(returned.tracks.map((track: any) => track.trackLength)).toEqual(clip.tracks.map((track: any) => track.trackLength));
    });
  });

  it("still rejects a genuinely wrong value", async () => {
    await withMcp(async (call) => {
      const { pattern } = await call("get_pattern", { genreId: "chicago-house" });
      // A string where bpm must be a number is not a field to pass through, it is a request to refuse.
      await expect(
        call("apply_pattern_ops", { pattern: { ...pattern, bpm: "fast" }, ops: [{ op: "swing", amount: 10 }] })
      ).rejects.toThrow(/bpm|number|invalid/i);
      // And a track field that is named still has its range checked.
      const badPan = structuredClone(pattern);
      badPan.tracks[0].pan = 4;
      await expect(
        call("apply_pattern_ops", { pattern: badPan, ops: [{ op: "swing", amount: 10 }] })
      ).rejects.toThrow(/pan|less than|invalid/i);
    });
  });
