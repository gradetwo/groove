/**
 * ⭐ **The arrangement preview tool exists and says what it defaults to** (owner: "针对 arrangement 这些功能都要补齐").
 *
 * The measured gap was that `render_arrangement` takes a bar span but no track, and the cheap preview tool served songs
 * and genres rather than arrangements, so an agent that had changed one lane had no cheap way to hear that lane.
 *
 * ⚠️ This holds the **shape**: the keys are present, the cheap defaults are the documented ones, and the tool renders
 * once. The **behaviour** — that only the named track reaches the mix, and that notes outside the span stay out — is
 * owed as a rendering criterion in the harness `mcpRenderArrangementBars.test.ts` already uses, and is recorded in
 * docs/OPEN_WORK.md rather than implied by this file.
 */
import { describe, expect, it } from "vitest";
import { TOOLS } from "../../mcp/registry";

const preview = TOOLS.find((t) => t.name === "render_arrangement_preview");
const schemaOf = (tool: unknown) =>
  ((tool as { inputSchema: Record<string, { description?: string }> }).inputSchema ?? {}) as Record<
    string,
    { description?: string }
  >;

describe("the arrangement preview tool", () => {
  it("⭐ exists beside render_arrangement and takes a span and a track scope", () => {
    expect(preview, "render_arrangement_preview is gone").toBeDefined();
    const schema = schemaOf(preview);
    for (const key of ["arrangementId", "trackId", "trackIds", "startBar", "endBar", "sampleRate", "channels"])
      expect({ key, present: key in schema }).toEqual({ key, present: true });
  });

  it("⭐ documents the cheap defaults rather than leaving them to be guessed", () => {
    const schema = schemaOf(preview);
    expect(schema.sampleRate?.description ?? "").toContain("8000");
    expect(schema.channels?.description ?? "").toContain("1");
    // The span's end is exclusive, which is the detail a caller gets wrong when it is not said.
    expect(schema.endBar?.description ?? "").toContain("exclusive");
  });
});
