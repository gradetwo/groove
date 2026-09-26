import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * The covers tree ships artwork and nothing else.
 *
 * The cover-production batch lived **inside** `public/covers`, so the build copied it into `dist/covers` and every deploy
 * published it: 410 MB of scratch, 96 MB of rejected/review/installed art, triage JSON, logs, state files and `__pycache__`
 * — a 794 MB `dist/covers` where about 285 MB is art. The owner found it by looking at `dist`. The tooling now lives in
 * `tools/covers/`, outside anything the build copies, and `scripts/check_covers_payload.mjs` is the gate.
 *
 * The test runs that gate against the **source** tree (the built one is checked in `npm run verify`, after the build exists):
 * a `.py`, a `.json`, a log or an unknown directory appearing under `public/covers` fails here.
 */
describe("the covers payload", () => {
  it("passes its own gate on the source tree", () => {
    const output = execFileSync(process.execPath, ["scripts/check_covers_payload.mjs", "--dir=public/covers"], {
      cwd: path.resolve(__dirname, "../.."),
      encoding: "utf8",
    });
    expect(output).toContain("nothing else");
  });

  it("keeps the production tooling out of the published tree", () => {
    // The scripts are not deleted — they are the owner's cover pipeline — so they must exist somewhere the build ignores.
    expect(fs.existsSync(path.resolve(__dirname, "../../tools/covers/_batch_runner.py"))).toBe(true);
    expect(fs.existsSync(path.resolve(__dirname, "../../public/covers/_batch_runner.py"))).toBe(false);
    expect(fs.existsSync(path.resolve(__dirname, "../../public/covers/_batch_scratch"))).toBe(false);
  });
});
