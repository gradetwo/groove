/**
 * **`inspect_instrument_sfz` takes an instrument, a file, or neither — and says which.**
 *
 * The tool was declared with one required parameter, `url`, described as *"the SFZ's address; `list_sample_libraries`
 * reports one per instrument"*. Neither half of that sentence survived contact with the surface:
 *
 *   * `list_sample_libraries` reports each library's **provenance** — `sourceUrl` (a repository page), `repo`, `pin`,
 *     licence and instrument count. It reports **no `.sfz` address at all**; measured on this checkout, the reply
 *     contains zero strings matching `/\.sfz/`. So the documented route to a usable `url` did not exist, and the
 *     owner's own plan ("get a URL from `list_sample_libraries`, then inspect the keyswitches") could not be carried
 *     out at all.
 *   * an instrument **name** — the thing every other tool takes, and the thing a caller has — reached the handler and
 *     was fetched as a URL: `{"raw":"Failed to parse URL from vsco2ce-violin"}`. A `TypeError`'s text, with no
 *     sentence about what to do instead.
 *
 * So both inputs are now accepted and exactly one is required: `assetId` resolves through the same catalogue
 * `list_arrangement_instruments` lists, `url` is used as given, and the two are never silently traded for each other.
 * This criterion holds every branch, with `fetch` stubbed, so the **address resolution** is what is judged rather
 * than the network. The reverse is to remove either branch: the name case then fails to resolve and the URL case is
 * refused as "not an http(s) address".
 *
 * It also holds the owner's original purpose — the `sw_*` reading. `sw_last` alone said a region was gated and never
 * said *which articulation* the gate selected; the names live in `sw_label` and the power-on value in `sw_default`,
 * both of which the summariser used to drop. Removing the `sw_` prefix from `INTERESTING` in `mcp/sfzInspect.ts`
 * turns the last case red.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { TOOLS } from "../../mcp/registry";
import { catalogueAssetById } from "../../mcp/instruments";

/** A program with a keyswitch group in it, so a row the old list dropped has to appear. */
const SFZ = [
  "<control>",
  "default_path=Samples/",
  "<global>",
  "sw_default=36",
  "<group> sw_lokey=36 sw_hikey=38 sw_last=36 sw_label=Bowed",
  "<region> sample=a.wav note_polyphony=2",
  "<group> sw_last=37 sw_label=Hard Mallets",
  "<region> sample=b.wav",
].join("\n");

const asked: string[] = [];

function stubFetch() {
  asked.length = 0;
  vi.stubGlobal("fetch", async (url: unknown) => {
    asked.push(String(url));
    return { ok: true, status: 200, text: async () => SFZ };
  });
}

const tool = () => {
  const found = TOOLS.find((candidate) => candidate.name === "inspect_instrument_sfz");
  expect(found, "inspect_instrument_sfz is not declared").toBeTruthy();
  return found!;
};

/**
 * The reply body, whichever shape came back: a successful handler returns its result object directly, while
 * `failure()` returns an MCP tool result whose message is in `content[0].text` (the shape `check_mcp.mjs` unwraps).
 */
const body = (reply: unknown): Record<string, unknown> => {
  const value = reply as { content?: Array<{ text?: string }> };
  if (Array.isArray(value?.content)) {
    const text = value.content[0]?.text ?? "";
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { raw: text };
    }
  }
  return (reply ?? {}) as Record<string, unknown>;
};

/** The message a refusal carries, so both shapes read the same way. */
const message = (reply: unknown): string => {
  const parsed = body(reply);
  return String(parsed.raw ?? parsed.error ?? JSON.stringify(parsed));
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("inspect_instrument_sfz's inputs", () => {
  it("reads an instrument by id, resolving its source address out of the catalogue", async () => {
    const assetId = "vcsl:Vibraphone-Keyswitch";
    const asset = catalogueAssetById(assetId);
    expect(asset?.sfz?.url, `${assetId} is not in the catalogue, so this criterion cannot judge the name path`).toBeTruthy();
    stubFetch();

    const reply = body(await tool().handler({ assetId }));
    expect(reply.regions, `the name path must read a program: ${JSON.stringify(reply)}`).toBe(2);
    // ⭐ The address came from the catalogue, not from the argument — that is the whole point of accepting a name.
    expect(reply.servedFrom).toBe(asset!.sfz!.url);
    expect(asked[0]).toBe(asset!.sfz!.url);
    expect(String(asset!.sfz!.url)).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
  });

  it("reads a program by url when the caller already holds an address", async () => {
    const url = "https://example.test/programs/kit.sfz";
    stubFetch();
    const reply = body(await tool().handler({ url }));
    expect(reply.servedFrom).toBe(url);
    expect(reply.regions).toBe(2);
    expect(asked[0]).toBe(url);
  });

  it("reports every switch opcode, including the label and the power-on default", async () => {
    stubFetch();
    const reply = body(await tool().handler({ url: "https://example.test/programs/kit.sfz" }));
    const rows = (reply.rows ?? []) as Array<{ opcode: string; value: string }>;
    const written = new Set(rows.map((row) => `${row.opcode}=${row.value}`));
    // The articulation's own name — the fact `1efe6ba` exists to report, and the one the owner wanted to see. Two
    // distinct labels are two rows, because a parameter written twice with different values is two facts.
    expect(written.has("sw_label=Bowed")).toBe(true);
    expect(written.has("sw_label=Hard Mallets")).toBe(true);
    expect(written.has("sw_default=36")).toBe(true);
    expect(written.has("sw_last=36")).toBe(true);
    expect(written.has("sw_lokey=36")).toBe(true);
    expect(written.has("sw_hikey=38")).toBe(true);
    // And the non-keyswitch half is unchanged by the prefix.
    expect(written.has("note_polyphony=2")).toBe(true);
  });

  it("refuses both inputs rather than silently picking one", async () => {
    stubFetch();
    const text = message(await tool().handler({ assetId: "vcsl:Vibraphone-Keyswitch", url: "https://example.test/kit.sfz" }));
    expect(text).toContain("not both");
    expect(asked, "a refused call must not reach the network").toHaveLength(0);
  });

  it("refuses neither input by naming the tool that lists the ids", async () => {
    const text = message(await tool().handler({}));
    expect(text).toContain("list_arrangement_instruments");
    expect(text).toContain("assetId");
    expect(text).toContain("url");
  });

  it("names the argument an instrument name belongs in when a bare name is sent as a url", async () => {
    const text = message(await tool().handler({ url: "vsco2ce-violin" }));
    expect(text).toContain("not an http(s) address");
    expect(text).toContain("assetId");
  });

  it("names the near ids when an instrument id does not exist", async () => {
    const text = message(await tool().handler({ assetId: "vcsl:Vibraphone-Keywitch" }));
    expect(text).toContain("no instrument");
    expect(text).toContain("list_arrangement_instruments");
    expect(text, "a miss should point at what does exist").toContain("vcsl:Vibraphone-Keyswitch");
  });

  it("refuses a fallbackUrl that would have no effect, rather than accepting and ignoring it", async () => {
    const text = message(await tool().handler({ assetId: "vcsl:Vibraphone-Keyswitch", fallbackUrl: "https://example.test/mirror.sfz" }));
    expect(text).toContain("fallbackUrl");
  });
});
