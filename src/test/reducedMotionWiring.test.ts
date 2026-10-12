/**
 * ♿ **The app honours a person's own reduced-motion choice, not only their system's.**
 *
 * `useReducedMotion` has existed with the whole mechanism — it reads the stored preference, follows the system query,
 * and writes `.reduced-motion` on the root element — but nothing called it. `GalaxyView` was the only reader of that
 * class and it OR-ed the class with the media query, so a user who picked "reduce" while their operating system said
 * otherwise saw nothing change, and every `.reduced-motion` rule in the stylesheets was dead. The wiring point was
 * recorded as the conservative first step (`docs/OPEN_WORK.md` §364): one call at the root, no markup change.
 *
 * The criterion holds both halves: the app calls it, and the hook still owns the class.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APP = "src/App.tsx";
const HOOK = "src/hooks/useReducedMotion.ts";

describe("reduced motion is wired at the root", () => {
  it("⭐ App calls the hook, rather than only importing it", () => {
    const app = readFileSync(APP, "utf8");
    expect({ imports: app.includes('from "./hooks/useReducedMotion"'), calls: /\n\s*useReducedMotion\(\);/.test(app) })
      .toEqual({ imports: true, calls: true });
  });

  it("⭐ the hook still owns the root class, so the call has an effect", () => {
    const hook = readFileSync(HOOK, "utf8");
    expect({
      adds: hook.includes('classList.add("reduced-motion")'),
      removes: hook.includes('classList.remove("reduced-motion")'),
      listens: hook.includes("prefers-reduced-motion: reduce"),
    }).toEqual({ adds: true, removes: true, listens: true });
  });

  it("⭐ still measures, so an emptied App cannot pass quietly", () => {
    const app = readFileSync(APP, "utf8");
    expect({ sizeable: app.length > 10_000, exportsApp: app.includes("export function App()") })
      .toEqual({ sizeable: true, exportsApp: true });
  });
});
