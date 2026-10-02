/**
 * ⭐ **The track kind is `synth`, and `instrument` is refused everywhere.**
 *
 * The kind was called `instrument`, and the word was the defect: a caller who wanted a piano read it, chose it, and got
 * a fixed built-in synthesiser (`mcp/registry.ts`'s description of `set_arrangement_track_asset` had said all along
 * that only a sampler plays a catalogue asset). The rename is a **clean break** — no input alias, no read-time
 * normalisation (the owner's rule: old callers and old data may simply be dropped) — so this file pins the two halves
 * that a clean break needs: the old value **fails loudly with the values that do exist** rather than being accepted,
 * and the new value reports **what the track will actually sound through**.
 *
 * It goes through the protocol rather than calling handlers, because schema validation is exactly the layer a handler
 * test cannot see: `mcpSchemaPassthrough.test.ts` records the same reason for its own subject.
 */
import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer } from "../../mcp/server";

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

/** One call's outcome, with the error text kept rather than thrown — the refusal **is** the evidence here. */
interface CallOutcome {
  ok: boolean;
  text: string;
  json: any;
}

/** A whole MCP session in one process, as `mcpSchemaPassthrough.test.ts` does for its own subject. */
async function withMcp<T>(run: (call: (name: string, args: Record<string, unknown>) => Promise<CallOutcome>) => Promise<T>): Promise<T> {
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "groove-kind-rename", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const call = async (name: string, args: Record<string, unknown>): Promise<CallOutcome> => {
    try {
      const result = (await client.callTool({ name, arguments: args })) as ToolResult;
      const first = result.content?.[0];
      const text = first && first.type === "text" ? first.text ?? "" : "";
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { ok: !result.isError, text, json };
    } catch (error) {
      return { ok: false, text: (error as Error).message, json: undefined };
    }
  };
  try {
    return await run(call);
  } finally {
    await client.close();
    await server.close();
  }
}

describe("the arrangement track kind is `synth`", () => {
  /**
   * ⭐ **The old value is refused by the schema, and the error names what exists.** This is the criterion the owner
   * asked for: `instrument` is not an alias, so a caller that still sends it must learn the new spelling from the
   * refusal rather than from a track that quietly sounds like a synth.
   */
  it("refuses kind:\"instrument\" on add_arrangement_track, naming synth as the value that exists", async () => {
    await withMcp(async (call) => {
      const created = await call("create_arrangement", { blankKind: "synth" });
      expect(created.ok).toBe(true);
      const refused = await call("add_arrangement_track", { arrangementId: created.json.arrangementId, kind: "instrument", name: "钢琴" });
      expect(refused.ok).toBe(false);
      /**
       * The refusal is the schema's own: it names the field (`at kind`) and **lists the values that exist**, with
       * `synth` first. The SDK does not echo the received value, and that is fine — what a caller needs is the
       * spelling to use next, which this gives.
       */
      expect(refused.text).toContain("at kind");
      expect(refused.text).toContain('expected one of "synth"|"sampler"|"drumkit"|"fx"|"folder"');
      // Nothing was added: the refusal is the whole answer, not a warning beside a created track.
      const listed = await call("get_arrangement", { arrangementId: created.json.arrangementId });
      expect(listed.json.tracks.map((track: { name: string }) => track.name)).not.toContain("钢琴");
    });
  });

  it("refuses kind:\"instrument\" on set_arrangement_track_kind and on create_arrangement too", async () => {
    await withMcp(async (call) => {
      const refusedCreate = await call("create_arrangement", { blankKind: "instrument" });
      expect(refusedCreate.ok).toBe(false);
      expect(refusedCreate.text).toContain("synth");

      const created = await call("create_arrangement", { blankKind: "synth" });
      const trackId = created.json.tracks[0].id;
      const refusedChange = await call("set_arrangement_track_kind", { arrangementId: created.json.arrangementId, trackId, kind: "instrument" });
      expect(refusedChange.ok).toBe(false);
      expect(refusedChange.text).toContain("synth");
      // The model is untouched by the refused change.
      expect(created.json.tracks[0].kind).toBe("synth");
    });
  });

  /**
   * ⭐ **The accepted spelling reports the sound source**, which is the report's own reproduction walked end to end: the
   * track list names the built-in preset, and `problems` carries the executable next step.
   */
  it("accepts kind:\"synth\" and answers with the built-in preset and the sampler call that would replace it", async () => {
    await withMcp(async (call) => {
      const created = await call("create_arrangement", { blankKind: "synth" });
      const added = await call("add_arrangement_track", { arrangementId: created.json.arrangementId, kind: "synth", name: "钢琴" });
      expect(added.ok).toBe(true);
      const piano = added.json.summary.tracks.find((track: { name: string }) => track.name === "钢琴");
      expect(piano.kind).toBe("synth");
      expect(piano.sound).toMatchObject({ source: "builtin-synth", presetKey: "analogLead", presetName: "Analog Lead", selectable: false });
      const notice = (added.json.problems as string[]).find((problem) => problem.includes("钢琴"));
      expect(notice).toBeDefined();
      expect(notice).toMatch(/kind:"sampler"/);
      expect(notice).toMatch(/add_arrangement_track/);
    });
  });

  it("creates a sampler with its asset in the same call, and refuses the asset on a synth", async () => {
    await withMcp(async (call) => {
      const created = await call("create_arrangement", { blankKind: "drumkit" });
      const sampler = await call("add_arrangement_track", {
        arrangementId: created.json.arrangementId,
        kind: "sampler",
        name: "Piano",
        assetId: "salamander-grand",
      });
      expect(sampler.ok).toBe(true);
      expect(sampler.json.summary.tracks.find((track: { name: string }) => track.name === "Piano").sound).toMatchObject({
        source: "catalogue-asset",
        assetId: "salamander-grand",
        selectable: true,
      });

      const refused = await call("add_arrangement_track", {
        arrangementId: created.json.arrangementId,
        kind: "synth",
        name: "Piano 2",
        assetId: "salamander-grand",
      });
      expect(refused.ok).toBe(false);
      expect(refused.text).toMatch(/only a sampler track/);
    });
  });
});
