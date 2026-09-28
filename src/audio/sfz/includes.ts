/**
 * SFZ's `#include`, resolved as a **pure** function with an injected reader.
 *
 * Measured reason this exists: the first real library this project pulled down (`sfzinstruments/virtuosity_drums`, `Programs/01-basic-kit.sfz`) contained **zero** `<region>`
 * headers, because the regions live in `keymaps/keymap_basic.sfz` and the program reaches them with `#include`. Real libraries separate a program from its keymap, so this
 * is not an optional feature — without it a library parses to nothing at all.
 *
 * `parseSfz` still touches no I/O, and neither does this: the reader is injected, which is what makes the three failure modes that matter here — a **cycle**, a **missing
 * file** and a **nesting depth** — testable without a network and without a browser.
 */
export interface IncludeReader {
  /** Returns the file's text, or `undefined` when there is no such file. */
  (path: string): string | undefined;
}

export interface ExpandIncludesResult {
  /** The text with every resolvable include replaced **in place**, so included regions land where the directive sat. */
  text: string;
  /** Every problem found, named — never a silent omission. */
  problems: string[];
  /** The paths that were read, in the order they were resolved, so a caller can report what an instrument actually loaded. */
  included: string[];
}

/** Joins a directory and a path without inventing a resolver: SFZ paths are relative, and `..` is normal in them. */
function resolvePath(fromPath: string, wanted: string): string {
  if (wanted.startsWith("/") || /^[a-zA-Z]+:/.test(wanted)) return wanted;
  const directory = fromPath.includes("/") ? fromPath.slice(0, fromPath.lastIndexOf("/")) : "";
  const parts = `${directory}/${wanted}`.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

const INCLUDE = /^\s*#include\s+"([^"]+)"\s*$/;

export function expandIncludes(
  text: string,
  read: IncludeReader,
  { path = "", maxDepth = 8, stack = [] as string[] }: { path?: string; maxDepth?: number; stack?: string[] } = {}
): ExpandIncludesResult {
  const problems: string[] = [];
  const included: string[] = [];
  const lines = text.split("\n");
  const out: string[] = [];

  lines.forEach((line, index) => {
    const match = line.match(INCLUDE);
    if (!match) {
      out.push(line);
      return;
    }
    const wanted = resolvePath(path, match[1]!);
    const where = `${path || "<root>"}:${index + 1}`;

    if (stack.includes(wanted)) {
      // A cycle is reported rather than followed: includes can legitimately reference each other, and an unguarded resolver recurses until the stack dies.
      problems.push(`${where}: circular include of "${wanted}" (already reading ${stack.join(" → ")})`);
      return;
    }
    if (stack.length >= maxDepth) {
      problems.push(`${where}: include depth ${stack.length + 1} exceeds maxDepth ${maxDepth} at "${wanted}"`);
      return;
    }

    const child = read(wanted);
    if (child === undefined) {
      problems.push(`${where}: included file "${wanted}" was not found`);
      return;
    }

    const nested = expandIncludes(child, read, { path: wanted, maxDepth, stack: [...stack, wanted] });
    out.push(nested.text);
    problems.push(...nested.problems);
    included.push(wanted, ...nested.included);
  });

  return { text: out.join("\n"), problems, included };
}
