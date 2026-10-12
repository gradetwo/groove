/**
 * Deterministic Web Storage for the test environment (D-01).
 *
 * Why this exists: on a Node **v26.8.2** run of the full suite, **167 tests failed** and every
 * one of them was storage-backed — `TypeError: Cannot read properties of undefined (reading
 * 'clear')` from `localStorage.clear()` in `beforeEach`. The same suite is green on Node
 * v22.22.3. The cause is not Groove Lab code: newer Node versions expose a global
 * `localStorage`, and Vitest's jsdom environment only installs jsdom's own globals for keys
 * that are **not already present** on `globalThis`, so jsdom's working `localStorage` never
 * lands and the tests inherit a Node global that is unavailable without a backing file.
 *
 * Depending on the host's Node version for a *test* primitive is not acceptable — the suite
 * has to mean the same thing everywhere — so the storage is installed explicitly here, from
 * jsdom when it exists and from a Map-backed implementation otherwise.
 *
 * This is deliberately not a mock: `Storage` semantics (string coercion, `length`, `key(i)`,
 * removal, clear) are implemented so tests exercise real behaviour rather than a stub that
 * only records calls.
 */

export interface StorageLike {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

/** A spec-shaped `Storage` backed by a Map. Used when jsdom's own implementation is absent. */
export function createStorageFallback(seed?: Iterable<[string, string]>): StorageLike {
  const map = new Map<string, string>();
  if (seed) for (const [k, v] of seed) map.set(String(k), String(v));
  return {
    get length() {
      return map.size;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    getItem(key: string) {
      const k = String(key);
      return map.has(k) ? (map.get(k) as string) : null;
    },
    setItem(key: string, value: string) {
      map.set(String(key), String(value));
    },
    removeItem(key: string) {
      map.delete(String(key));
    },
    clear() {
      map.clear();
    },
  };
}

/**
 * Point `target`'s `localStorage`/`sessionStorage` at a working implementation.
 *
 * Prefers the jsdom window's own storage (so `window.localStorage` and the bare global stay
 * the same object, which existing tests rely on); falls back to the Map implementation when
 * the window has none, when reading it throws (opaque origin) or when jsdom itself is absent.
 *
 * Returns what was installed, so a test can assert the contract without guessing.
 */
export function installWebStorage(
  target: Record<string, unknown> = globalThis as unknown as Record<string, unknown>,
  windowLike?: { localStorage?: StorageLike; sessionStorage?: StorageLike } | null
): { localStorage: StorageLike; sessionStorage: StorageLike; source: "jsdom" | "fallback" } {
  // `undefined` means "use the ambient window"; an explicit `null` means "there is none",
  // which is how a test reproduces a host with no jsdom storage at all.
  const win =
    windowLike === undefined
      ? typeof window !== "undefined"
        ? (window as unknown as { localStorage?: StorageLike; sessionStorage?: StorageLike })
        : null
      : windowLike;

  const readWin = (name: "localStorage" | "sessionStorage"): StorageLike | null => {
    try {
      const value = win?.[name];
      // A present-but-unusable storage (no backing file) must not be trusted: exercise it.
      if (value && typeof value.setItem === "function" && typeof value.clear === "function") {
        const probe = "__groove_storage_probe__";
        value.setItem(probe, "1");
        value.removeItem(probe);
        return value;
      }
    } catch {
      /* opaque origin, or a Node global that throws without a storage file */
    }
    return null;
  };

  const local = readWin("localStorage");
  const session = readWin("sessionStorage");
  const source: "jsdom" | "fallback" = local ? "jsdom" : "fallback";
  const localImpl = local ?? createStorageFallback();
  const sessionImpl = session ?? createStorageFallback();

  const define = (name: string, value: unknown) => {
    try {
      Object.defineProperty(target, name, { value, configurable: true, writable: true });
    } catch {
      // A non-configurable host global would be unusual; overwriting the property is the
      // best we can do, and the assertion below in the test will make it visible.
      target[name] = value;
    }
  };
  define("localStorage", localImpl);
  define("sessionStorage", sessionImpl);

  return { localStorage: localImpl, sessionStorage: sessionImpl, source };
}
