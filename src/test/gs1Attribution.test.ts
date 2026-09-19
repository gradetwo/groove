/**
 * GS-1 attribution compliance (P6 / requirement 11, Phase 2 precondition).
 *
 * The vendored GS-1 core links DaisySP and Soundpipe **into its WASM binary**, and the upstream
 * artifacts ship neither library's notice — only GS-1's own MIT `LICENSE`. Redistributing that
 * binary without the notices is a licence violation, and it is the kind that is invisible: the
 * WASM still loads, every gate stays green, and nothing in the repo says anything is missing.
 * The plan therefore makes this a **precondition** for any build that makes GS-1 audible.
 *
 * These tests check the three ways the obligation can quietly break:
 *   1. the notices file disappears, or is emptied of a required notice;
 *   2. the copy served with the app (`public/`) drifts from the source of truth in `vendor/gs1/`;
 *   3. the code that makes GS-1 audible ships while the notices do not.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(TEST_DIR, "..");
const REPO_ROOT = path.resolve(SRC_DIR, "..");

const VENDOR_NOTICES = path.join(REPO_ROOT, "vendor", "gs1", "THIRD_PARTY_NOTICES.md");
const PUBLIC_NOTICES = path.join(REPO_ROOT, "public", "THIRD_PARTY_NOTICES.md");
const VENDOR_LICENSE = path.join(REPO_ROOT, "vendor", "gs1", "LICENSE");
const HOST_SOURCE = path.join(SRC_DIR, "audio", "gs1", "Gs1Host.ts");

/**
 * Copyright holders that must appear.
 *
 * Taken verbatim from the LICENSE files under `crates/synth-core/vendor/` in the sibling GS-1
 * repository, not from memory.
 */
const REQUIRED_NOTICES = [
  { label: "GS-1 itself", needle: "Copyright (c) 2025 GROOVE SYNTH GS-1 contributors" },
  { label: "DaisySP", needle: "DaisySP, copyright (c) 2020 Electrosmith, Corp." },
  { label: "Plaits (linked through DaisySP)", needle: "Plaits, copyright 2016 Emilie Gillet" },
  { label: "Soundpipe", needle: "Copyright (c) 2020 Paul Batchelor" },
  /** The permission grant itself, so the file cannot become a list of names. */
  { label: "the MIT permission grant", needle: "Permission is hereby granted, free of charge" },
  { label: "the MIT warranty disclaimer", needle: "WITHOUT WARRANTY OF ANY KIND" },
];

describe("GS-1 attribution (E5)", () => {
  it("ships a notices file in the repo", () => {
    expect(existsSync(VENDOR_NOTICES), `missing ${VENDOR_NOTICES}`).toBe(true);
    expect(existsSync(VENDOR_LICENSE), `missing ${VENDOR_LICENSE}`).toBe(true);
  });

  it("names every copyright holder whose code is linked into the core", () => {
    const text = readFileSync(VENDOR_NOTICES, "utf8");
    const missing = REQUIRED_NOTICES.filter((n) => !text.includes(n.needle)).map((n) => n.label);
    expect(missing, `notices missing: ${missing.join(", ")}`).toEqual([]);
  });

  it("serves a byte-identical copy with the app", () => {
    expect(existsSync(PUBLIC_NOTICES), `missing ${PUBLIC_NOTICES}`).toBe(true);
    // Byte-identical on purpose: two hand-maintained copies of a legal notice is how one of
    // them ends up stale. `public/` is the copy users can actually fetch.
    expect(readFileSync(PUBLIC_NOTICES)).toEqual(readFileSync(VENDOR_NOTICES));
  });

  it("explains why the file exists at all (the upstream gap)", () => {
    // Whitespace is normalised before matching: the sentence wraps across lines in the
    // markdown, and a reflow must not be able to break a compliance assertion.
    const text = readFileSync(VENDOR_NOTICES, "utf8").replace(/\s+/g, " ");
    // The next reader must not "clean this up" as redundant with vendor/gs1/LICENSE.
    expect(text).toMatch(/neither library's notice ships with the upstream build artifacts/i);
  });

  it("keeps the audible-code precondition honest", () => {
    /**
     * The rule the plan states: no build that makes GS-1 audible may ship before the notices do.
     * This test cannot inspect a build, so it asserts the invariant that is checkable here — if
     * the adapter that makes GS-1 audible exists in `src/`, the notices exist too — and records
     * the limitation explicitly rather than implying more coverage than it has.
     */
    const adapterExists = existsSync(HOST_SOURCE);
    if (adapterExists) {
      expect(existsSync(VENDOR_NOTICES)).toBe(true);
      expect(existsSync(PUBLIC_NOTICES)).toBe(true);
    } else {
      // Nothing to gate: with no adapter, no build can route a track to GS-1.
      expect(adapterExists).toBe(false);
    }
  });
});
