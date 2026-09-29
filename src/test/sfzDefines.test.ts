import { describe, expect, it } from "vitest";
import { applyDefines } from "../audio/sfz/defines";

/**
 * The `#define` layer, whose absence is the difference between one wrong opcode and a silent library.
 *
 * The tests are written around what Salamander Grand Piano actually contains — variables in opcode **names**, and defines at the top — because a criterion written against a fixture would have missed exactly the form
 * that made this worth implementing.
 */
describe("SFZ #define resolution", () => {
  it("substitutes a variable in an opcode's value", () => {
    const { text } = applyDefines("#define $KEY 36\n<region> key=$KEY");
    expect(text).toContain("key=36");
  });

  it("substitutes a variable in an opcode's NAME, which is how Salamander writes its control block", () => {
    // ⭐ `label_cc$STR_RES=String Res` — the variable is part of the name, and a values-only expansion leaves an opcode called that.
    const { text } = applyDefines("#define $STR_RES 20\n<control> label_cc$STR_RES=String Res");
    expect(text).toContain("label_cc20=String Res");
    expect(text).not.toContain("$STR_RES");
  });

  it("accumulates definitions while scanning, so a define may use an earlier one", () => {
    // ⭐ The reason to accumulate rather than collect first: this resolves, and a two-pass collector would leave `$DIR` as a literal.
    const { text } = applyDefines("#define $DIR Samples\n#define $PATH $DIR/piano.flac\n<region> sample=$PATH");
    expect(text).toContain("sample=Samples/piano.flac");
  });

  it("names a variable that was used but never defined, because that is the case that becomes silence", () => {
    const { unresolved } = applyDefines("<region> key=$MISSING sample=$ALSO_MISSING\n<region> key=$MISSING");
    // Deduplicated in order of first use: the caller needs the list, not the count.
    expect(unresolved).toEqual(["$MISSING", "$ALSO_MISSING"]);
  });

  it("reports the definitions it made, and does not leave the directives for the parser", () => {
    const { text, defines } = applyDefines("#define $A 1\n#define $B 2\n<region> key=$A");
    expect(defines).toEqual([{ name: "$A", value: "1" }, { name: "$B", value: "2" }]);
    // ⭐ A `#define` is a directive, not an opcode: leaving the line behind would have the parser store `#define $A 1` as an opcode.
    expect(text).not.toContain("#define");
  });
});
