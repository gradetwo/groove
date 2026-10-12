import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getInitialLanguage, DICTIONARY } from "../i18n/LanguageContext";

describe("Language Initialization & Persistence (P1-12)", () => {
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    const store: Record<string, string> = {};
    const mockStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
    };
    Object.defineProperty(globalThis, "localStorage", {
      value: mockStorage,
      writable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, "localStorage", {
      value: originalLocalStorage,
      writable: true,
    });
  });

  it("returns saved language from localStorage if 'en'", () => {
    localStorage.setItem("groove_language", "en");
    expect(getInitialLanguage()).toBe("en");
  });

  it("returns saved language from localStorage if 'zh'", () => {
    localStorage.setItem("groove_language", "zh");
    expect(getInitialLanguage()).toBe("zh");
  });

  it("detects browser language and writes back to localStorage when not yet stored", () => {
    localStorage.removeItem("groove_language");
    Object.defineProperty(navigator, "language", {
      value: "en-US",
      configurable: true,
    });
    const lang = getInitialLanguage();
    expect(lang).toBe("en");
    expect(localStorage.getItem("groove_language")).toBe("en");
  });

  it("detects Chinese browser language and writes back to localStorage", () => {
    localStorage.removeItem("groove_language");
    Object.defineProperty(navigator, "language", {
      value: "zh-CN",
      configurable: true,
    });
    const lang = getInitialLanguage();
    expect(lang).toBe("zh");
    expect(localStorage.getItem("groove_language")).toBe("zh");
  });

  it("verifies dictionary has both zh and en entries for core UI keys", () => {
    expect(DICTIONARY["app_title"]).toBeDefined();
    expect(DICTIONARY["app_title"].zh).toBeTruthy();
    expect(DICTIONARY["app_title"].en).toBeTruthy();
  });

  it("interpolates template variables in formatMessage", async () => {
    const { formatMessage } = await import("../i18n/LanguageContext");
    expect(formatMessage("Hello {name}!", { name: "Producer" })).toBe("Hello Producer!");
    expect(formatMessage("Pattern {bar}/{total}", { bar: 1, total: 4 })).toBe("Pattern 1/4");
    expect(formatMessage("Static text")).toBe("Static text");
    expect(formatMessage("Missing {missing} var", {})).toBe("Missing {missing} var");
  });
});
