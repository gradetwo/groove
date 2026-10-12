/**
 * A small XML reader — the subset of the DOM that reading MusicXML needs, built on `saxes`.
 *
 * **Why this exists rather than `DOMParser`.** The reader was written against `DOMParser`, which a browser and `jsdom` have and **Node does not**: `typeof DOMParser` is `undefined` on this project's Node 22. The unit suite runs under `jsdom`, so every criterion passed while `import_arrangement_musicxml` — the MCP tool — answered `{"raw":"DOMParser is not defined"}` to every real client. A reader that only works in a test environment makes MusicXML import a capability the MCP server cannot have at all, which is worse than not offering it.
 *
 * `saxes` is ISC, has one dependency (`xmlchars`, MIT), and is a real XML parser: it reads the DOCTYPE, expands the five predefined entities, reports a malformed document with a line and column, and does no I/O. What is written here is the tree and the handful of lookups this reader performs — not a DOM.
 *
 * **What is deliberately absent**: namespaces beyond stripping the prefix from a tag name, CSS in general, `innerHTML`, mutations, and `Node` typing. The reader asks for a tag by name, for its children and its text, and for an attribute; that and three selector shapes (`a`, `a b`, `a > b`, optionally comma-separated) are the whole surface, and each of the reader's selectors is one of them.
 */
import { SaxesParser } from "saxes";

/**
 * An element as this reader uses one. `tagName` is local — a `x:score-partwise` is reported as `score-partwise` — and `textContent` is the concatenation of every text node below it, which is what the DOM spec says and what the reader relies on for `<duration>4</duration>`.
 */
export interface XmlElement {
  readonly tagName: string;
  readonly textContent: string;
  readonly children: readonly XmlElement[];
  getAttribute(name: string): string | null;
  querySelector(selector: string): XmlElement | null;
  querySelectorAll(selector: string): XmlElement[];
}

export interface XmlDocument {
  readonly documentElement: XmlElement;
}

/** The DOM's own type, so a caller reading an `XmlElement` follows a shape it already knows. */
const PARENT = Symbol("xmlParent");

interface MutableElement extends XmlElement {
  readonly [PARENT]: MutableElement | null;
  attributes: Record<string, string>;
  kids: MutableElement[];
  text: string;
}

function localName(tag: string): string {
  const colon = tag.indexOf(":");
  return colon === -1 ? tag : tag.slice(colon + 1);
}

function attributesOf(tag: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(tag)) {
    out[localName(key)] = String(value);
  }
  return out;
}

function textOf(element: MutableElement): string {
  let text = element.text;
  for (const child of element.kids) text += textOf(child);
  return text;
}

interface SelectorStep {
  /** `>` for an immediate parent, `" "` for any ancestor. */
  combinator: string;
  name: string;
}

/**
 * A selector as steps, so the matcher never has to know how a combinator was spelled.
 *
 * The first version split on whitespace and treated a bare `>` as if it were another element name, which made every direct-child selector (`work > work-title`, `time > beats`) find nothing — the failure showed up as five reader criteria returning `undefined`, which is exactly the kind of silence a hand-rolled selector produces.
 */
function stepsOf(selector: string): SelectorStep[] {
  const steps: SelectorStep[] = [];
  let combinator = "";
  for (const token of selector.trim().split(/\s+/)) {
    if (token === ">") {
      combinator = ">";
      continue;
    }
    if (token.length === 0) continue;
    steps.push({ combinator: steps.length === 0 ? "" : combinator || " ", name: token });
    combinator = "";
  }
  return steps;
}

/**
 * The relation a selector needs is only ever parent-to-child, so one step matches when the element's name is equal. There is no state to keep and nothing to reset, which is what makes this small.
 */
function segmentMatches(element: MutableElement, name: string): boolean {
  return name === "*" || element.tagName === name;
}

function parentOf(element: MutableElement): MutableElement | null {
  return element[PARENT];
}

/** Every element below this one, in document order, excluding itself. */
function descendants(element: MutableElement): MutableElement[] {
  const out: MutableElement[] = [];
  const walk = (node: MutableElement) => {
    for (const child of node.kids) {
      out.push(child);
      walk(child);
    }
  };
  walk(element);
  return out;
}

function queryAll(root: MutableElement, selector: string): MutableElement[] {
  const groups = selector
    .split(",")
    .map((group) => stepsOf(group))
    .filter((steps) => steps.length > 0);
  if (groups.length === 0) return [];

  /**
   * **The candidates are walked once, in document order, and each one is offered to every group.** The first version walked each group in turn, so `beat-type, work-title` came back in selector order where jsdom returns document order — a difference that would have made the reader's answer depend on which environment it ran in, which is the exact class of bug this module exists to remove.
   */
  const found: MutableElement[] = [];
  for (const candidate of descendants(root)) {
    for (const steps of groups) {
      const last = steps[steps.length - 1]!;
      if (!segmentMatches(candidate, last.name)) continue;
      /**
       * A candidate has to match the last step and then, walking upwards, each earlier step — with `>` meaning "the immediate parent" and a space meaning "some ancestor". Reading it backwards is what makes a descendant selector work without a recursive matcher for each step.
       */
      let current: MutableElement | null = parentOf(candidate);
      let matched = true;
      for (let index = steps.length - 2; index >= 0; index -= 1) {
        const step = steps[index]!;
        if (steps[index + 1]!.combinator === ">") {
          if (!current || !segmentMatches(current, step.name)) {
            matched = false;
            break;
          }
          current = parentOf(current);
          continue;
        }
        // A space: the nearest ancestor that matches, then carry on above it.
        let ancestor: MutableElement | null = current;
        while (ancestor && !segmentMatches(ancestor, step.name)) ancestor = parentOf(ancestor);
        if (!ancestor) {
          matched = false;
          break;
        }
        current = parentOf(ancestor);
      }
      if (matched) {
        found.push(candidate);
        break;
      }
    }
  }
  return found;
}

/**
 * Parse a document into the tree above.
 *
 * **A malformed document throws**, as `DOMParser` reports a `parsererror`, and the message is the parser's own — "1:13: unclosed tag" — because a caller deciding what to do with a broken file needs to know where it broke. An empty document throws too, rather than returning a tree with no root.
 */
export function parseXml(text: string): XmlDocument {
  const parser = new SaxesParser();
  const stack: MutableElement[] = [];
  let root: MutableElement | null = null;

  parser.on("error", (error) => {
    throw new Error(error.message);
  });

  parser.on("opentag", (tag) => {
    const element: MutableElement = {
      [PARENT]: stack.length > 0 ? stack[stack.length - 1]! : null,
      tagName: localName(tag.name),
      attributes: attributesOf(tag.attributes as Record<string, unknown>),
      kids: [],
      text: "",
      get textContent(): string {
        return textOf(element);
      },
      get children(): readonly XmlElement[] {
        return element.kids;
      },
      getAttribute(name: string): string | null {
        return Object.prototype.hasOwnProperty.call(element.attributes, name) ? element.attributes[name]! : null;
      },
      querySelector(selector: string): XmlElement | null {
        return queryAll(element, selector)[0] ?? null;
      },
      querySelectorAll(selector: string): XmlElement[] {
        return queryAll(element, selector);
      },
    };
    if (stack.length > 0) stack[stack.length - 1]!.kids.push(element);
    else if (root === null) root = element;
    stack.push(element);
  });

  parser.on("text", (value) => {
    if (stack.length > 0) stack[stack.length - 1]!.text += value;
  });

  parser.on("cdata", (value) => {
    if (stack.length > 0) stack[stack.length - 1]!.text += value;
  });

  parser.on("closetag", () => {
    stack.pop();
  });

  parser.write(text).close();
  if (!root) throw new Error("the document has no root element");
  return { documentElement: root };
}
