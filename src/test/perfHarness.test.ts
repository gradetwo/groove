/**
 * **The harness has to measure the phone shell, and a profile it could not measure has to fail the run.**
 *
 * Two failures, both measured on 2026-10-12 with `npm run perf:check` on the owner's machine:
 *
 *   1. `Mobile 390x844 (4G + 4x CPU) ... FAILED: page.evaluate: Execution context was destroyed, most
 *      likely because of a navigation.`
 *   2. `✅ measurement complete` and **exit 0** immediately after it.
 *
 * Both were the same blind spot: the mobile profile opened the desktop root and trusted the app's own
 * redirect to `/m` (`src/app/phoneEntry.ts` → `App.tsx`'s `window.location.replace`). The redirect
 * landed while `page.evaluate` was collecting, so a third of the measurement silently did not exist —
 * and every mobile optimisation made from then on would have been justified by a number nobody took.
 *
 * What this file does *not* claim: it does not drive a real browser. `run()` is called with a stub that
 * speaks the six methods `measure()` uses, so the criteria can judge the orchestration — which URL each
 * profile opens, whether both profiles report, and what a failed profile does to the verdict — in
 * milliseconds and without a Playwright install. The real measurement is the `perf:check` leg of CI
 * (`.github/workflows/ci.yml`, "Performance Gate") plus the readings in the commit message.
 */
import { describe, expect, it } from "vitest";
import { countGenreChunks, PROFILES, profileTargetUrl, run, summarizeRun } from "../../scripts/measure_live_perf.mjs";

const DESKTOP = PROFILES.find((profile) => !profile.mobile)!;
const MOBILE = PROFILES.find((profile) => profile.mobile)!;

/** The six metrics the harness has to keep collecting, asserted by name so a field cannot be dropped quietly. */
const METRIC_KEYS = ["fcp", "lcp", "cls", "dcl", "load", "wallMs", "totalTransferredKb", "jsKb", "cssKb", "imageKb", "resources"];

interface FakePageOptions {
  /** Throw from `page.evaluate`, exactly as the destroyed execution context did. */
  evaluateError?: Error;
}

class FakePage {
  /** Every URL this page was sent to — one entry, because the harness opens the shell directly. */
  readonly navigations: string[] = [];

  constructor(private readonly expectedPath: string, private readonly options: FakePageOptions = {}) {}

  on(): void {}
  async goto(url: string): Promise<null> {
    this.navigations.push(url);
    return null;
  }
  async waitForLoadState(): Promise<void> {}
  url(): string {
    return `http://127.0.0.1:9${this.expectedPath}`;
  }
  async evaluate(): Promise<unknown> {
    if (this.options.evaluateError) throw this.options.evaluateError;
    return {
      fcp: 1200,
      lcp: 2400,
      cls: 0.01,
      domContentLoaded: 1100,
      loadEvent: 2200,
      resourceCount: 31,
      transferredBytes: 2 * 1024 * 1024,
      sizeByUrl: {},
    };
  }
  async close(): Promise<void> {}
}

/**
 * A browser as `measure()` uses one: `newContext` → `newCDPSession` → `newPage`, one context per profile
 * in the order the profiles are declared. The pages are kept so a criterion can read where they went.
 */
class FakeBrowser {
  readonly pages: FakePage[] = [];
  private opened = 0;

  constructor(private readonly failing: "none" | "mobile" | "all" = "none") {}

  async newContext(): Promise<unknown> {
    const profile = PROFILES[this.opened++]!;
    const shouldFail = this.failing === "all" || (this.failing === "mobile" && profile.mobile);
    const page = new FakePage(profile.path, shouldFail ? { evaluateError: new Error("Execution context was destroyed, most likely because of a navigation.") } : {});
    this.pages.push(page);
    return {
      newPage: async () => page,
      newCDPSession: async () => ({ send: async () => {} }),
      close: async () => {},
    };
  }
}

describe("every profile measures the surface it names", () => {
  it("sends the mobile profile to the phone shell rather than to the desktop root", () => {
    // The regression: it went to `/`, was redirected to `/m`, and the redirect destroyed the context.
    expect(profileTargetUrl("http://127.0.0.1:1234", MOBILE)).toBe("http://127.0.0.1:1234/m");
    expect(profileTargetUrl("http://127.0.0.1:1234", DESKTOP)).toBe("http://127.0.0.1:1234/");
  });

  it("names a path for every profile, so a new one cannot inherit 'wherever the app lands'", () => {
    for (const profile of PROFILES) {
      expect(profile.path, `${profile.name} declares no path`).toMatch(/^\//);
    }
  });

  it("counts genre code chunks, and does not count the clip manifest the phone shell reads", () => {
    // The A-01 regression is a second `assets/genre-*.js` on first paint — measured on the phone shell
    // that is a real number: 1 for `/m` itself (chicago-house), which is what the gate allows.
    expect(countGenreChunks(["http://x/assets/genre-house-Ca6kEOtc.js"])).toEqual(["genre-house-Ca6kEOtc.js"]);
    // The mobile clip player's own manifest is a data fetch, not a prefetched module. Counting it made
    // the new mobile reading red on 2026-10-12 with "fetched more than 1 genre chunk(s)".
    expect(countGenreChunks(["http://x/genre-clips.json"])).toEqual([]);
    expect(countGenreChunks(["http://x/assets/genre-house.js", "http://x/genre-clips.json", "http://x/assets/vendor-react.js"])).toEqual([
      "genre-house.js",
    ]);
  });

  it("measures two different pages, and reports a result for both", async () => {
    const browser = new FakeBrowser();
    const { results, failures, summary } = await run({ browser: browser as never, base: "http://127.0.0.1:1234" });

    // Both profiles report. This is the assertion the old mobile profile could not satisfy.
    expect(failures).toEqual([]);
    expect(results.map((result) => result.profile)).toEqual(PROFILES.map((profile) => profile.name));

    // Each profile was opened at the path it declares, without relying on a redirect to get there.
    expect(browser.pages.map((page) => page.navigations)).toEqual([["http://127.0.0.1:1234/"], ["http://127.0.0.1:1234/m"]]);

    // And the report still carries every metric the mobile work is judged on.
    for (const result of results) {
      for (const key of METRIC_KEYS) {
        expect(result, `${result.profile} is missing ${key}`).toHaveProperty(key);
      }
      expect(result.genreChunksOnLoad).toBe(0);
    }
    expect(summary.ok).toBe(true);
  });
});

describe("a profile that failed fails the run", () => {
  it("records the failure and turns the verdict red instead of printing FAILED and exiting 0", async () => {
    const { results, failures, summary } = await run({ browser: new FakeBrowser("mobile") as never, base: "http://127.0.0.1:9" });

    // The failing profile is recorded, not thrown away — exactly the path the old script lost.
    expect(failures.map((failure) => failure.profile)).toEqual([MOBILE.name]);
    expect(failures[0]!.error).toContain("Execution context was destroyed");
    expect(results.map((result) => result.profile)).toEqual([DESKTOP.name]);
    expect(summary.ok).toBe(false);
    expect(summary.problems.join("\n")).toContain(MOBILE.name);
  });

  it("fails the run rather than the profile when no page can be driven at all", async () => {
    const { results, failures, summary } = await run({ browser: new FakeBrowser("all") as never, base: "http://127.0.0.1:9" });
    expect(results).toEqual([]);
    expect(failures).toHaveLength(2);
    expect(summary.ok).toBe(false);
  });

  it("turns the A-01 genre-chunk judgement red the way it always did", () => {
    const measured = [DESKTOP, MOBILE].map((profile) => ({
      profile: profile.name,
      path: profile.path,
      landedPath: profile.path,
      genreChunksOnLoad: 2,
      genreChunkNames: ["genre-house.js", "genre-techno.js"],
      fcp: 1000,
      fcpFallback: false,
      lcp: 2000,
      cls: 0,
      dcl: 900,
      load: 1800,
      wallMs: 2500,
      totalTransferredKb: 1,
      jsKb: 1,
      cssKb: 0,
      imageKb: 0,
      resources: 1,
    }));
    const summary = summarizeRun(measured, [], 1);
    expect(summary.ok).toBe(false);
    expect(summary.problems.join("\n")).toContain("A-01 regression");
  });

  it("does not call an empty run complete", () => {
    expect(summarizeRun([], [], 1).ok).toBe(false);
  });
});
