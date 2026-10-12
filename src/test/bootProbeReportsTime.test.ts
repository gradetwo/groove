/**
 * ⏱ **The boot probe answers with a number, not only with "it started".**
 *
 * The plan's baseline section recorded `probe:boot` as a smoke test that says the built app mounts and nothing about
 * how long that took, which left the one reading a person would actually compare across nights unmeasured. The probe
 * now starts a clock before the navigation and stops it when the splash element is gone, and prints the result with
 * its 口径: a cold renderer, a build served from this machine, no network shaping — a regression signal, not a
 * production figure. Measured twice on 2026-10-05: 1199 ms and 1170 ms.
 *
 * The criterion holds the mechanism: the clock starts before `page.goto`, and the line is printed with the scope
 * attached. It cannot hold the number itself, because that belongs to the machine of the day.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const SOURCE = "scripts/probe_boot.mjs";

describe("the boot probe reports time to a usable app", () => {
  it("⭐ starts the clock before the navigation", () => {
    const text = readFileSync(SOURCE, "utf8");
    const clock = text.indexOf("bootStartedAt = Date.now()");
    const goto = text.indexOf("page.goto(");
    expect({ hasClock: clock >= 0, beforeNavigation: clock >= 0 && goto > clock })
      .toEqual({ hasClock: true, beforeNavigation: true });
  });

  it("⭐ prints the milliseconds with the scope that makes them honest", () => {
    const text = readFileSync(SOURCE, "utf8");
    expect({
      prints: /time to a usable app: \$\{bootMs\} ms/.test(text),
      scope: text.includes("navigation → splash gone") && text.includes("cold renderer"),
    }).toEqual({ prints: true, scope: true });
  });

  it("⭐ still measures, so an emptied probe cannot pass quietly", () => {
    const text = readFileSync(SOURCE, "utf8");
    expect({ sizeable: text.length > 2000, mounts: text.includes("getElementById(\"root\")") })
      .toEqual({ sizeable: true, mounts: true });
  });
});
