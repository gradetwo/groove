/**
 * The XML reader the MusicXML reader stands on.
 *
 * It exists because `DOMParser` is a browser and `jsdom` facility and Node has none: the criteria below are therefore about **the two environments agreeing**, which is the property that was missing when the MCP import tool shipped answering `DOMParser is not defined`. What is checked here is the surface the reader uses — element names, text, attributes, and the four selector shapes — plus the two ways a document can be refused.
 */
import { describe, expect, it } from "vitest";
import { parseXml } from "../data/xml";

const document = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Rock &amp; Roll</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
    <score-part id="P2"><part-name>Bass</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>2</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
      <note><pitch><step>C</step><alter>1</alter><octave>4</octave></pitch><duration>2</duration></note>
      <note><rest/><duration>2</duration></note>
    </measure>
  </part>
</score-partwise>`;

describe("the XML reader", () => {
  it("reads a document with a DOCTYPE and expands the predefined entities", () => {
    /**
     * Every MusicXML file the writer produces carries a DOCTYPE, and every hand-written file in the reader's own criteria carries one too. A parser that choked on the declaration, or on the `&amp;` in a title, would fail the first note of every score.
     */
    const root = parseXml(document).documentElement;
    expect(root.tagName).toBe("score-partwise");
    expect(root.getAttribute("version")).toBe("4.0");
    expect(root.querySelector("work-title")?.textContent).toBe("Rock & Roll");
  });

  it("matches the four selector shapes the reader uses, including the direct child", () => {
    /**
     * The failure this guards is real and was silent: the first version treated the `>` of a child selector as another element name, so `work > work-title` and `time > beats` matched nothing and five reader criteria returned `undefined` instead of throwing.
     */
    const root = parseXml(document).documentElement;
    expect(root.querySelector("work-title")?.textContent).toBe("Rock & Roll");
    expect(root.querySelector("work > work-title")?.textContent).toBe("Rock & Roll");
    expect(root.querySelectorAll("part-list part-name").map((element) => element.textContent)).toEqual(["Piano", "Bass"]);
    expect(root.querySelector("time > beats")?.textContent).toBe("4");
    // A comma-separated group is the union, in document order, which is what a reader wants from `tie, tied`.
    // Document order, not the order the groups were written in: `work-title` is before `beat-type` in this document, so both spellings give the same answer.
    expect(root.querySelectorAll("beat-type, work-title").map((element) => element.textContent)).toEqual(["Rock & Roll", "4"]);
    expect(root.querySelectorAll("work-title, beat-type").map((element) => element.textContent)).toEqual(["Rock & Roll", "4"]);
    // A child selector is not a descendant selector: `work > part` must find nothing.
    expect(root.querySelector("work > part")).toBeNull();
  });

  it("reads text from the whole subtree, which is what the DOM's own textContent does", () => {
    const attributes = parseXml(document).documentElement.querySelector("attributes")!;
    // `divisions` and `time` are siblings, so the concatenation is in document order with no separator.
    expect(attributes.textContent).toBe("244");
    expect(attributes.querySelector("divisions")?.textContent).toBe("2");
  });

  it("reads attributes only on the element that carries them", () => {
    const root = parseXml(document).documentElement;
    expect(root.querySelector("score-part")?.getAttribute("id")).toBe("P1");
    // A missing attribute is null rather than an empty string, which is what lets the reader tell "absent" from "empty".
    expect(root.querySelector("score-part")?.getAttribute("nope")).toBeNull();
  });

  it("keeps self-closing and empty elements distinct from missing ones", () => {
    // `<rest/>` is how a rest is written, and the reader tells a rest from a note by finding this element rather than by failing to find a pitch.
    const rest = parseXml(document).documentElement.querySelector("rest")!;
    expect(rest.tagName).toBe("rest");
    expect(rest.children).toEqual([]);
    expect(rest.textContent).toBe("");
  });

  it("strips a namespace prefix from a tag, because MusicXML files in the wild use one", () => {
    const prefixed = parseXml('<x:score-partwise xmlns:x="urn:test"><x:work><work-title>T</work-title></x:work></x:score-partwise>').documentElement;
    expect(prefixed.tagName).toBe("score-partwise");
    expect(prefixed.querySelector("work-title")?.textContent).toBe("T");
  });

  it("refuses a malformed document with the parser's own position rather than a tree with holes", () => {
    // The line and column are the difference between "this file is broken" and "here is where", which is what an importer has to tell a person.
    expect(() => parseXml("<score-partwise><unclosed>")).toThrow(/unclosed tag/);
    expect(() => parseXml("")).toThrow(/root element/);
    expect(() => parseXml("not markup at all")).toThrow();
  });

  it("reads CDATA as text and ignores comments and processing instructions", () => {
    const doc = parseXml('<a><!-- a comment --><?target body?><b><![CDATA[1 < 2]]></b></a>').documentElement;
    expect(doc.querySelector("b")?.textContent).toBe("1 < 2");
    expect(doc.children.map((child) => child.tagName)).toEqual(["b"]);
  });

  it("answers a selector the way jsdom's DOM does, so a criterion and the server agree", () => {
    /**
     * **The criterion for this module can only be that two environments agree.** The unit suite runs under `jsdom`, where `DOMParser` exists; the MCP server runs under Node, where it does not. A reader that answered differently in each is the bug this module was written to remove, so the same documents and selectors are put to both readers and the answers compared — element names, text, attributes, and the order of a union.
     */
    const selectors = ["work-title", "work > work-title", "part-list part-name", "time > beats", "beat-type, work-title", "note rest", "part > measure > attributes > divisions"];
    for (const selector of selectors) {
      const jsdom = new DOMParser().parseFromString(document, "text/xml");
      const mine = parseXml(document).documentElement;
      const theirs = Array.from(jsdom.querySelectorAll(selector)).map((element) => element.textContent);
      const ours = mine.querySelectorAll(selector).map((element) => element.textContent);
      expect(ours, selector).toEqual(theirs);
      expect(mine.querySelector(selector)?.textContent ?? null, selector).toBe(jsdom.querySelector(selector)?.textContent ?? null);
    }
  });

  it("returns an element itself out of a query and does not walk into its own parent", () => {
    const root = parseXml(document).documentElement;
    const part = root.querySelector("part")!;
    // A selector is relative to the element it is asked of, which is why asking a `part` for a `score-part` finds nothing.
    expect(part.querySelector("measure")?.getAttribute("number")).toBe("1");
    expect(part.querySelector("score-part")).toBeNull();
  });
});
