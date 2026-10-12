import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/**
 * Every `run:` block in every workflow must be **shell-parseable**, and no workflow may contain a written error body.
 *
 * Both checks exist because of a real failure: a commit of mine put the **tail of a JSON API error** into a `git checkout` line, so the runner died with
 * `unexpected EOF while looking for matching '"'` — and `check:actions` passed the file, because it validates the YAML and **cannot see shell syntax inside a
 * `run:` block**. A gate that cannot fail for the reason you care about is not a gate, so this is the instrument that can: it extracts each block and asks `bash -n`.
 *
 * The JSON check is narrower and catches the exact mistake: an error body has no business in a workflow at all.
 */
const workflows = () =>
  readdirSync(".github/workflows")
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => join(".github/workflows", name));

/** Extract every block scalar under `run:` (any of `run: |`, `run: >`, with or without a following blank line). */
function runBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i]!.match(/^(\s*)run:\s*[|>][-+]?\s*$/);
    if (!header) continue;
    const indent = header[1]!.length;
    const body: string[] = [];
    for (let j = i + 1; j < lines.length; j += 1) {
      const line = lines[j]!;
      if (line.trim() !== "" && line.search(/\S/) <= indent) break;
      body.push(line);
    }
    blocks.push(body.join("\n"));
  }
  return blocks;
}

describe("workflow hygiene", () => {
  it("every run block is shell-parseable — the check the actions gate cannot make", () => {
    const failures: string[] = [];
    for (const path of workflows()) {
      runBlocks(readFileSync(path, "utf8")).forEach((block, index) => {
        try {
          // `bash -n` parses without executing, which is exactly the runner's first step for a shell step.
          execFileSync("bash", ["-n"], { input: block, stdio: ["pipe", "pipe", "pipe"] });
        } catch (error) {
          failures.push(`${path} run block #${index + 1}: ${(error as { stderr?: Buffer }).stderr?.toString().trim() ?? "did not parse"}`);
        }
      });
    }
    expect(failures).toEqual([]);
  });

  it("no workflow contains a written API error body", () => {
    // The exact shape that got committed once: the tail of a failed `gh api` call, quotes and all.
    const offenders = workflows().filter((path) => {
      const text = readFileSync(path, "utf8");
      return text.includes('"documentation_url"') || text.includes('"message":"No commit found');
    });
    expect(offenders).toEqual([]);
  });

  it("finds the run blocks it claims to check, so a silent extraction failure is impossible", () => {
    // A guard on the guard: if the extractor stopped matching, the first test would pass vacuously.
    const total = workflows().reduce((sum, path) => sum + runBlocks(readFileSync(path, "utf8")).length, 0);
    expect(total).toBeGreaterThan(5);
  });
});
