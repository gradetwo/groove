/**
 * D-01 — Web Storage must exist regardless of the host Node version.
 *
 * Reproduces the exact condition that turned the full suite red on Node v26.8.2: a
 * `globalThis` whose `localStorage` is absent (or present but unusable) while jsdom's own
 * window storage is either available or also missing. Before the fix, every storage-backed
 * test in the suite crashed with `Cannot read properties of undefined (reading 'clear')`.
 */
import { describe, it, expect } from "vitest";
import { createStorageFallback, installWebStorage, type StorageLike } from "./webStorage";

const asTarget = () => ({}) as Record<string, unknown>;

describe("web storage shim (D-01)", () => {
  it("installs a working Storage when neither the host global nor jsdom has one", () => {
    const target = asTarget();
    const { source } = installWebStorage(target, null);
    const storage = target.localStorage as StorageLike;

    expect(source).toBe("fallback");
    // The exact call that used to crash: `localStorage.clear()` in a beforeEach.
    expect(() => storage.clear()).not.toThrow();

    storage.setItem("groove_language", "en");
    expect(storage.getItem("groove_language")).toBe("en");
    expect(storage.length).toBe(1);
    expect(storage.key(0)).toBe("groove_language");
    storage.removeItem("groove_language");
    expect(storage.getItem("groove_language")).toBeNull();
    expect(storage.length).toBe(0);
    expect(storage.key(0)).toBeNull();
  });

  it("coerces keys and values to strings, like the real Storage API", () => {
    const storage = createStorageFallback();
    // @ts-expect-error — deliberately passing non-strings, as the DOM API coerces them.
    storage.setItem(42, 7);
    expect(storage.getItem("42")).toBe("7");
    expect(storage.key(0)).toBe("42");
  });

  it("prefers jsdom's own storage so window.localStorage stays the same object", () => {
    const jsdomStorage = createStorageFallback([["a", "1"]]);
    const target = asTarget();
    const { source, localStorage } = installWebStorage(target, { localStorage: jsdomStorage, sessionStorage: jsdomStorage });
    expect(source).toBe("jsdom");
    expect(localStorage).toBe(jsdomStorage);
    expect(target.localStorage).toBe(jsdomStorage);
  });

  it("rejects a present-but-unusable host storage instead of trusting its existence", () => {
    // This is the Node-26 shape: the key exists, the object throws or is never usable.
    const brokenHost = { setItem: () => { throw new Error("no storage file"); }, clear: () => {} } as unknown as StorageLike;
    const target = asTarget();
    const { source } = installWebStorage(target, { localStorage: brokenHost });
    expect(source).toBe("fallback");
    expect(() => (target.localStorage as StorageLike).setItem("k", "v")).not.toThrow();
    expect((target.localStorage as StorageLike).getItem("k")).toBe("v");
  });

  it("seeds and clears the fallback independently of any host", () => {
    const first = createStorageFallback([["x", "1"], ["y", "2"]]);
    const second = createStorageFallback();
    expect(first.length).toBe(2);
    expect(first.getItem("y")).toBe("2");
    first.clear();
    expect(first.length).toBe(0);
    expect(second.length).toBe(0);
  });

  it("has a usable global localStorage in this very suite (the setup hook ran)", () => {
    // Guards the wiring itself: if `src/test/setup.ts` stops calling installWebStorage, this
    // fails here rather than as 167 unrelated failures on someone else's machine.
    expect(typeof localStorage.clear).toBe("function");
    localStorage.setItem("d01_probe", "ok");
    expect(localStorage.getItem("d01_probe")).toBe("ok");
    localStorage.clear();
    expect(localStorage.length).toBe(0);
  });
});
