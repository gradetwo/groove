/**
 * ⭐ **The vocal tool's copy has to say which half it does, because it used to say it did nothing.**
 *
 * `synthesize_vocal` was an honest stub: it reported singing synthesis as reserved, and a split of its long sentence was
 * pinned word for word so the split could not silently drop a clause. It now does something real — it binds a lane to one
 * of the synth's five factory vowel voices — and the copy that mattered then would be a **lie** now.
 *
 * So the pins move to the new contract, and the one that has to survive is the distinction:
 *
 *   - it voices a lane, naming the patches a caller may choose;
 *   - and it says plainly that it does **not** synthesise singing, because a share code carries a voice rather than words.
 *     That second half is the part a later edit is most likely to tidy away, and a tool that let a caller believe their
 *     lyric had been sung would be worse than the stub it replaced.
 */
import { registrySource } from "./helpers/registrySource";
import { describe, expect, it } from "vitest";

const TOOL = "synthesize_vocal";
const source = registrySource();
const start = source.indexOf('name: "' + TOOL + '"');
const block = source.slice(start, source.indexOf('name: "', start + 10));
const description = /\bdescription:\s*\n?\s*"((?:[^"\\]|\\.)*)"/s.exec(block)![1];

describe(TOOL + "'s description, now that it voices a lane", () => {
  it("⭐ names the patches a caller may choose, so the voices are discoverable from the tool itself", () => {
    for (const id of ["vocalah", "vocaloh", "vocalee", "vocaloo", "vocalhum"]) {
      expect({ id, named: description.includes(id) }).toEqual({ id, named: true });
    }
  });

  it("⭐ keeps the half that says it does not sing, which is the claim a later edit would tidy away", () => {
    expect({ sings: /does not synthesi[sz]e singing/i.test(description) }).toEqual({ sings: true });
    // And it points at the tool that *does* bind a lyric, rather than leaving the caller to work it out.
    expect({ points: description.includes("set_arrangement_vocal_melody") }).toEqual({ points: true });
  });

  it("⭐ no longer claims to be reserved or unimplemented, which is what it was", () => {
    expect({ reserved: /reserved/i.test(description) }).toEqual({ reserved: false });
    expect({ notImplemented: /not implemented/i.test(description) }).toEqual({ notImplemented: false });
  });

  it("⭐ and no sentence is over two hundred characters, so the copy stays readable", () => {
    const longest = Math.max(...description.split(/(?<=[.!?])\s+/).map((part) => part.length));
    expect({ under: longest < 200 }).toEqual({ under: true });
  });
});
