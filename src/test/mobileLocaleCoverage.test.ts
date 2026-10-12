import { describe, expect, it } from "vitest";
import { mobileMessages } from "../i18n/locales/mobile";

/**
 * ⭐ **Every phone string exists in both languages** (owner's plan for the port lists i18n beside the shell itself).
 *
 * Two earlier attempts to answer this with a regular expression were **wrong in different ways** — first truncating a value at
 * the first `}` inside its own `{count}` placeholder, then treating a multi-line entry as if it were missing a language. The
 * values are right there in a module, so this asks the module (and a hand-rolled parse of TypeScript is exactly the kind of
 * "confidently wrong" this project keeps finding).
 */
describe("the phone shell's strings", () => {
  it("⭐ are present in English and in Chinese, with nothing blank", () => {
    const entries = Object.entries(mobileMessages as Record<string, { en?: string; zh?: string }>);
    expect(entries.length, "the phone has strings to check").toBeGreaterThan(50);
    const missing = entries
      .filter(([, value]) => !value || !String(value.en ?? "").trim() || !String(value.zh ?? "").trim())
      .map(([key]) => key);
    expect(missing, `these phone strings lack a language: ${missing.join(", ")}`).toEqual([]);
  });
});
