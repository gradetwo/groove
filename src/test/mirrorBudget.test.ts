import { describe, expect, it } from "vitest";
import { checkMirrorBudget, formatBytes } from "../data/mirrorBudget";

/**
 * The check that runs **before** an upload, so the ceiling is a decision instead of a discovery.
 *
 * Both directions matter: allowing a run that would exceed the ceiling fills the bucket, and refusing one that fits blocks work for no reason.
 */
const GB = 1024 ** 3;

describe("the mirror budget check", () => {
  it("allows a run that fits, and names all three numbers", () => {
    const verdict = checkMirrorBudget({ plannedBytes: 0.5 * GB, storedBytes: 0.44 * GB, ceilingBytes: 10 * GB });
    expect(verdict.allowed).toBe(true);
    // Someone who set a budget needs to see what it is being spent on: one number is not a decision they can act on.
    expect(verdict.summary).toContain("would send");
    expect(verdict.summary).toContain("already stored");
    expect(verdict.summary).toContain("ceiling");
  });

  it("refuses a run that would cross the ceiling, and says so in the same three numbers", () => {
    const verdict = checkMirrorBudget({ plannedBytes: 12 * GB, storedBytes: 0.44 * GB, ceilingBytes: 10 * GB });
    expect(verdict.allowed).toBe(false);
    // The refusal must be as informative as the allowance, or raising the ceiling becomes guesswork.
    expect(verdict.summary).toMatch(/refused/);
    expect(verdict.summary).toContain("12.00 GB");
  });

  it("refuses landing exactly on the ceiling, which leaves no room for the next library", () => {
    // `>=` rather than `>`: a ceiling is a limit, not a target, and the next library would have nowhere to go.
    expect(checkMirrorBudget({ plannedBytes: 9.56 * GB, storedBytes: 0.44 * GB, ceilingBytes: 10 * GB }).allowed).toBe(false);
  });

  it("formats bytes as units a person reasons about", () => {
    expect(formatBytes(443 * 1024 ** 2)).toBe("443.0 MB");
    expect(formatBytes(10 * GB)).toBe("10.00 GB");
    expect(formatBytes(512)).toBe("512 B");
  });
});
