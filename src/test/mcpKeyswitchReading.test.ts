/**
 * **The keyswitch reading reaches the MCP reply, on both hosts.**
 *
 * `1efe6ba` taught the SFZ reader to honour `sw_*` and made the resolver report `switchState` (the value the
 * selection was made under) and `switchLabel` (the articulation's name in the file's own words). `loadNote` has
 * carried both since (`src/audio/sampleLoader.ts` copies them into `noteInfo`), and the MCP surface dropped them on
 * the floor: both hosts built their `resolved` object from `loadNote`'s result with an explicit field list, and the
 * two keyswitch fields were not on it. So the one fact a keyswitch library exists to communicate — *which take
 * answered* — was readable by the parser and invisible to a caller, which is the same shape as the gap
 * `inspect_instrument_sfz` was built for.
 *
 * Measured on this checkout before the fix, through `render_instrument_note` on the Node host:
 *
 *     {"assetId":"karoryfer-black-and-blue-basses:01-darkblack-keysw","midi":40,…,
 *      "resolved":{"samplePath":"../Samples/darkblack/reg/darkblack_e2_f_rr1.wav","ratio":1,"rootKey":40}}
 *
 * — no `switchState`, no `switchLabel`, while the resolver for the same file and note answers
 * `switchState=31 switchLabel="Pluck"` (`scripts/probe_sfz_keyswitch_mcp.ts`). After the fix the same call carries
 * both. The reverse is to delete the two spreads from `headlessNoteResolution` (or from its page-path twin in
 * `mcp/render/worker.ts`): the real case below then fails on `switchState`.
 *
 * The reference half runs everywhere; the real render skips loudly when the sample mirror is unreachable, the same
 * way `mcpHeadlessRender.test.ts` does, so an outage is not turned into a red criterion.
 */
import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import { headlessNoteResolution, HEADLESS_PACKAGE, headlessUnavailableMessage } from "../../mcp/render/headless";
import { TOOLS } from "../../mcp/registry";
import { catalogueAssetById } from "../../mcp/instruments";

const headlessInstalled = ((): boolean => {
  try {
    createRequire(import.meta.url)(HEADLESS_PACKAGE);
    return true;
  } catch {
    return false;
  }
})();

const tool = () => {
  const found = TOOLS.find((candidate) => candidate.name === "render_instrument_note");
  expect(found, "render_instrument_note is not declared").toBeTruthy();
  return found!;
};

describe("the note resolution the MCP surface reports", () => {
  it("carries the articulation the file's keyswitch selected, and its name", () => {
    const resolved = headlessNoteResolution({
      samplePath: "../Samples/darkblack/reg/darkblack_e2_f_rr1.wav",
      ratio: 1,
      rootKey: 40,
      switchState: 31,
      switchLabel: "Pluck",
    });
    expect(resolved.switchState).toBe(31);
    expect(resolved.switchLabel).toBe("Pluck");
    // The fields it already carried are not disturbed by the two new ones.
    expect(resolved.samplePath).toContain("darkblack_e2_f_rr1.wav");
    expect(resolved.rootKey).toBe(40);
  });

  it("omits them rather than inventing a value when the file has no keyswitch", () => {
    const resolved = headlessNoteResolution({ samplePath: "a.wav", ratio: 1, rootKey: 60 });
    // Absent means "this file has no switch", which is a different fact from "the switch was value 0".
    expect("switchState" in resolved).toBe(false);
    expect("switchLabel" in resolved).toBe(false);
  });

  it("still refuses to fall back when the Node host's package is missing", () => {
    // The mirrored sentence to `browserUnavailableMessage()`: a package, a command, and the thing that did not happen.
    const message = headlessUnavailableMessage(new Error("Cannot find module 'node-web-audio-api'"));
    expect(message).toContain("node-web-audio-api");
    expect(message).toContain("npm i -D node-web-audio-api");
    expect(message).toContain("No browser render was started instead");
    // And it says which document holds the reason the two hosts are not interchangeable.
    expect(message).toContain("HEADLESS_CORE_PLAN");
  });
});

/**
 * ⭐ **The same reading over the real MCP tool**, because the unit case above cannot prove that the tool's reply is
 * built from the builder rather than from a second, private copy.
 *
 * `karoryfer-black-and-blue-basses:01-darkblack-keysw` is the fixture: its program declares
 * `sw_lokey=27 sw_hikey=31 sw_default=31` and `sw_last=31 sw_label=Pluck`, and its recordings decode on the Node
 * host, so a plain `loadNote` answers with the power-on articulation. The skip is on a network failure only; a
 * resolved note with no `switchState` is the defect this file exists for and must stay red.
 */
describe.skipIf(!headlessInstalled)("render_instrument_note reports the keyswitch through the tool", () => {
  it("names the articulation that answered, in the file's own words", async (context) => {
    const assetId = "karoryfer-black-and-blue-basses:01-darkblack-keysw";
    if (!catalogueAssetById(assetId)?.sfz) {
      console.warn(`SKIP  keyswitch reading: ${assetId} is not in this checkout's catalogue`);
      context.skip();
      return;
    }

    let reply: Record<string, unknown>;
    try {
      reply = (await tool().handler({ assetId, midi: 40, headless: true, seconds: 0.4 })) as Record<string, unknown>;
    } catch (error) {
      if (/fetch|network|ENOTFOUND|ECONNREFUSED|HTTP \d|neither address/i.test((error as Error).message)) {
        console.warn(`SKIP  keyswitch reading: sample mirror unreachable — ${(error as Error).message}`);
        context.skip();
        return;
      }
      throw error;
    }

    const text = JSON.stringify(reply);
    if (/fetch|network|ENOTFOUND|ECONNREFUSED|HTTP \d|neither address/i.test(text)) {
      console.warn(`SKIP  keyswitch reading: sample mirror unreachable — ${text.slice(0, 300)}`);
      context.skip();
      return;
    }

    expect(reply.engine, `the Node host was asked for and must be the one that answered: ${text.slice(0, 300)}`).toBe("node-web-audio-api");
    const resolved = reply.resolved as Record<string, unknown>;
    // ⭐ The reading the owner wanted: which articulation the file's own switch selected, and what it is called.
    expect(resolved.switchState, `switchState missing from ${JSON.stringify(resolved)}`).toBe(31);
    expect(resolved.switchLabel).toBe("Pluck");
  }, 180_000);
});
