/**
 * G-03 — layout preference persistence.
 *
 * The plan requires four classes of malformed input to fall back to defaults without
 * throwing: `null`, invalid JSON, an unknown `version`, and wrong field types. These
 * tests go further on the last one on purpose: a single bad field must be repaired
 * *in place* rather than discarding the user's other four settings, because the whole
 * point of D-01 is that the layout survives a refresh.
 *
 * The load-bearing claim is "never throws, never breaks the studio", so every corruption
 * case is asserted twice: the returned value AND that nothing was thrown.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DENSITY_TIERS,
  DEFAULT_LAYOUT_PREFS,
  LAYOUT_BOOLEAN_KEYS,
  LAYOUT_PREFS_KEY,
  LAYOUT_PREFS_VERSION,
  SESSION_ONLY_FLAGS,
  clearLayoutPrefs,
  coerceLayoutPrefs,
  defaultLayoutPrefs,
  loadLayoutPrefs,
  saveLayoutPrefs,
  toPersistedShape,
} from "../features/sequencer/layoutPrefs";

/** A minimal in-memory `Storage`, so tests never depend on the real one. */
function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
    raw: map,
  } as unknown as Storage & { raw: Map<string, string> };
}

const write = (storage: Storage, value: unknown) =>
  storage.setItem(LAYOUT_PREFS_KEY, typeof value === "string" ? value : JSON.stringify(value));

describe("G-03 · round trip", () => {
  it("returns defaults when nothing has been stored", () => {
    expect(loadLayoutPrefs(memoryStorage())).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("restores every persisted toggle after a save", () => {
    const storage = memoryStorage();
    saveLayoutPrefs(
      {
        isSidebarCollapsed: true,
        isEditorMaximized: true,
        isVelocityLaneOpen: true,
        isAnalyzerOpen: false,
        showAdvancedControls: true,
        density: "compact",
        autoFollowPlayhead: false,
      },
      storage
    );

    const restored = loadLayoutPrefs(storage);
    expect(restored.isSidebarCollapsed).toBe(true);
    expect(restored.isEditorMaximized).toBe(true);
    expect(restored.isVelocityLaneOpen).toBe(true);
    expect(restored.isAnalyzerOpen).toBe(false);
    expect(restored.showAdvancedControls).toBe(true);
    expect(restored.autoFollowPlayhead).toBe(false);
    expect(restored.density).toBe("compact");
    expect(restored.version).toBe(LAYOUT_PREFS_VERSION);
  });

  it("stamps the schema version into the payload", () => {
    const storage = memoryStorage();
    saveLayoutPrefs({ isAnalyzerOpen: true }, storage);
    const stored = JSON.parse(storage.getItem(LAYOUT_PREFS_KEY)!);
    expect(stored.version).toBe(LAYOUT_PREFS_VERSION);
  });

  it("merges a partial save instead of dropping the other fields", () => {
    const storage = memoryStorage();
    saveLayoutPrefs({ isSidebarCollapsed: true, density: "comfortable" }, storage);
    saveLayoutPrefs({ isAnalyzerOpen: true }, storage);

    const restored = loadLayoutPrefs(storage);
    expect(restored.isSidebarCollapsed).toBe(true); // survived the second write
    expect(restored.density).toBe("comfortable");
    expect(restored.isAnalyzerOpen).toBe(true);
  });

  it("saveLayoutPrefs returns the preferences now in effect", () => {
    const storage = memoryStorage();
    const returned = saveLayoutPrefs({ isEditorMaximized: true }, storage);
    expect(returned.isEditorMaximized).toBe(true);
    expect(returned).toEqual(loadLayoutPrefs(storage));
  });
});

describe("G-03 · corruption class 1 — null / empty", () => {
  it("falls back to defaults for an absent key", () => {
    const storage = memoryStorage();
    expect(() => loadLayoutPrefs(storage)).not.toThrow();
    expect(loadLayoutPrefs(storage)).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("falls back to defaults for an empty string", () => {
    const storage = memoryStorage();
    write(storage, "");
    expect(loadLayoutPrefs(storage)).toEqual(DEFAULT_LAYOUT_PREFS);
  });
});

describe("G-03 · corruption class 2 — invalid JSON", () => {
  it("falls back to defaults instead of throwing", () => {
    const storage = memoryStorage();
    write(storage, "{not json at all");
    expect(() => loadLayoutPrefs(storage)).not.toThrow();
    expect(loadLayoutPrefs(storage)).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it.each(["undefined", "NaN", "[1,2,3]", '"a string"', "42", "true"])(
    "falls back to defaults for the non-object payload %s",
    (payload) => {
      const storage = memoryStorage();
      write(storage, payload);
      expect(() => loadLayoutPrefs(storage)).not.toThrow();
      expect(loadLayoutPrefs(storage)).toEqual(DEFAULT_LAYOUT_PREFS);
    }
  );
});

describe("G-03 · corruption class 3 — unknown version", () => {
  it("falls back wholesale for a future version", () => {
    const storage = memoryStorage();
    write(storage, { version: 999, isSidebarCollapsed: true, density: "compact" });
    const restored = loadLayoutPrefs(storage);
    // A shape we do not know must not be half-adopted: no guessing.
    expect(restored).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("falls back when the version is missing entirely", () => {
    const storage = memoryStorage();
    write(storage, { isSidebarCollapsed: true });
    expect(loadLayoutPrefs(storage)).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("falls back when the version is the wrong type", () => {
    for (const version of ["1", null, true, 1.5]) {
      expect(coerceLayoutPrefs({ version, isSidebarCollapsed: true })).toEqual(DEFAULT_LAYOUT_PREFS);
    }
  });
});

describe("G-03 · corruption class 4 — wrong field types", () => {
  it("repairs a bad field in place and keeps the good ones", () => {
    const storage = memoryStorage();
    write(storage, {
      version: LAYOUT_PREFS_VERSION,
      isSidebarCollapsed: true,
      isEditorMaximized: "yes", // wrong type
      isVelocityLaneOpen: true,
      isAnalyzerOpen: 1, // wrong type
      showAdvancedControls: true,
      density: "compact",
    });

    const restored = loadLayoutPrefs(storage);
    expect(restored.isSidebarCollapsed).toBe(true); // preserved
    expect(restored.isVelocityLaneOpen).toBe(true); // preserved
    expect(restored.showAdvancedControls).toBe(true); // preserved
    expect(restored.density).toBe("compact"); // preserved
    expect(restored.isEditorMaximized).toBe(false); // repaired to default
    expect(restored.isAnalyzerOpen).toBe(false); // repaired to default
  });

  it("rejects an unknown density tier", () => {
    expect(coerceLayoutPrefs({ version: LAYOUT_PREFS_VERSION, density: "ultra" }).density).toBe(
      DEFAULT_LAYOUT_PREFS.density
    );
    expect(coerceLayoutPrefs({ version: LAYOUT_PREFS_VERSION, density: 3 }).density).toBe(
      DEFAULT_LAYOUT_PREFS.density
    );
  });

  it("accepts every declared density tier", () => {
    for (const tier of DENSITY_TIERS) {
      expect(coerceLayoutPrefs({ version: LAYOUT_PREFS_VERSION, density: tier }).density).toBe(tier);
    }
  });

  it("tolerates extra unknown fields without adopting or choking on them", () => {
    const restored = coerceLayoutPrefs({
      version: LAYOUT_PREFS_VERSION,
      isSidebarCollapsed: true,
      somethingFromTheFuture: { nested: true },
    });
    expect(restored.isSidebarCollapsed).toBe(true);
    expect(restored).not.toHaveProperty("somethingFromTheFuture");
  });
});

describe("G-03 · storage failures never propagate", () => {
  it("survives a throwing getItem", () => {
    const hostile = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(() => loadLayoutPrefs(hostile)).not.toThrow();
    expect(loadLayoutPrefs(hostile)).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(() => saveLayoutPrefs({ isAnalyzerOpen: true }, hostile)).not.toThrow();
  });

  it("survives a quota-exceeded write and still reports the new state", () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {},
    } as unknown as Storage;
    const returned = saveLayoutPrefs({ isAnalyzerOpen: true }, full);
    expect(returned.isAnalyzerOpen).toBe(true);
  });

  it("works when there is no storage at all", () => {
    expect(() => loadLayoutPrefs(null)).not.toThrow();
    expect(loadLayoutPrefs(null)).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(saveLayoutPrefs({ isSidebarCollapsed: true }, null).isSidebarCollapsed).toBe(true);
  });
});

describe("G-03 · must not pollute other data", () => {
  it("writes only its own versioned key", () => {
    const storage = memoryStorage({ groove_project_v1: '{"sentinel":true}' });
    saveLayoutPrefs({ isSidebarCollapsed: true }, storage);
    expect(storage.getItem("groove_project_v1")).toBe('{"sentinel":true}');
    // Compare as a set: insertion order is an implementation detail of the store, not
    // part of the contract this test is defending.
    expect([...storage.raw.keys()].sort()).toEqual(
      [LAYOUT_PREFS_KEY, "groove_project_v1"].sort()
    );
  });

  it("clear() removes only its own key, never the project snapshot", () => {
    const storage = memoryStorage({ groove_project_v1: '{"sentinel":true}' });
    saveLayoutPrefs({ isSidebarCollapsed: true }, storage);
    clearLayoutPrefs(storage);
    expect(storage.getItem(LAYOUT_PREFS_KEY)).toBeNull();
    expect(storage.getItem("groove_project_v1")).toBe('{"sentinel":true}');
  });

  it("never persists the session-only flags (D-06)", () => {
    // The cheapest guard against a future "just persist everything" edit: these describe
    // live performance state, and restoring them silently would be a surprise (re-arming
    // the recorder on the next visit).
    //
    // The rogue fields are assembled outside the type system on purpose: the API's type
    // already rejects them (that is the first line of defence), so what this test
    // actually defends is the *runtime* filter — a caller who bypasses the types, e.g.
    // via a spread from parsed JSON, must still not get these written to storage.
    const storage = memoryStorage();
    const roguePayload: Record<string, unknown> = { isSidebarCollapsed: true };
    for (const flag of SESSION_ONLY_FLAGS) roguePayload[flag] = true;

    saveLayoutPrefs(roguePayload as Parameters<typeof saveLayoutPrefs>[0], storage);

    const persisted = JSON.parse(storage.getItem(LAYOUT_PREFS_KEY)!);
    for (const flag of SESSION_ONLY_FLAGS) {
      expect(persisted).not.toHaveProperty(flag);
    }
    expect(Object.keys(persisted).sort()).toEqual(
      ["version", "density", ...LAYOUT_BOOLEAN_KEYS].sort()
    );
  });
});

describe("G-03 · shape is exactly what we think it is", () => {
  it("persists the version, the five booleans and the density tier — nothing else", () => {
    const shape = toPersistedShape({ ...defaultLayoutPrefs(), isAnalyzerOpen: true });
    expect(Object.keys(shape).sort()).toEqual(
      ["version", "density", ...LAYOUT_BOOLEAN_KEYS].sort()
    );
    expect(shape.isAnalyzerOpen).toBe(true);
  });

  it("hands out a mutable copy of the defaults, not the frozen shared object", () => {
    const a = defaultLayoutPrefs();
    a.isSidebarCollapsed = true;
    expect(defaultLayoutPrefs().isSidebarCollapsed).toBe(false);
  });
});

describe("G-03 · the real localStorage is used by default", () => {
  beforeEach(() => window.localStorage.clear());
  afterEach(() => window.localStorage.clear());

  it("round-trips through the browser storage this app actually ships against", () => {
    saveLayoutPrefs({ isSidebarCollapsed: true, density: "compact" });
    const stored = window.localStorage.getItem(LAYOUT_PREFS_KEY);
    expect(stored).toBeTruthy();
    expect(loadLayoutPrefs().isSidebarCollapsed).toBe(true);
  });

  it("does not throw when the stored blob is garbage", () => {
    window.localStorage.setItem(LAYOUT_PREFS_KEY, "{{{");
    const spy = vi.fn();
    try {
      spy(loadLayoutPrefs());
    } catch {
      throw new Error("loadLayoutPrefs must not throw on garbage input");
    }
    expect(spy).toHaveBeenCalledWith(DEFAULT_LAYOUT_PREFS);
  });
});

/**
 * D-02 wiring guard.
 *
 * The module tests above prove the store is correct; these prove something is actually *connected*
 * to it. Without them the feature can silently regress to "persistence module exists, nothing calls
 * it" — which is exactly the state the plan found the repo in (module-less, five bare
 * `useState(false)`).
 *
 * The wiring moved: it used to live inline in `StudioView`, and these assertions were written
 * against that file's source text. It now lives in `usePanelVisibility`, which is the point of the
 * extraction — a 1255-line view was holding the read-once discipline and the persist effect that
 * every surface needs. So this guard follows the behaviour rather than pinning the file it used to
 * be in: the hook must own the wiring, and `StudioView` must actually mount the hook.
 *
 * `panelVisibility.test.ts` exercises the same behaviour at runtime (defaults, write-back, the
 * session-only rule), so these source assertions only have to catch disconnection.
 */
describe("D-02 · the preference store is wired", () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
  const hookSource = read("src/features/sequencer/hooks/usePanelVisibility.ts");
  const studioSource = read("src/views/StudioView.tsx");

  it("reads the preferences once on mount and writes them on change", () => {
    expect(hookSource).toMatch(/loadLayoutPrefs\(\)/);
    expect(hookSource).toMatch(/saveLayoutPrefs\(\{/);
  });

  it("persists every declared layout toggle", () => {
    const call = hookSource.match(/saveLayoutPrefs\(\{([\s\S]*?)\}\)/);
    expect(call, "saveLayoutPrefs({...}) call not found in the panel-visibility hook").toBeTruthy();
    for (const key of LAYOUT_BOOLEAN_KEYS) {
      expect(call![1], "layout toggle " + key + " is not persisted").toContain(key);
    }
  });

  it("keeps the session-only flags out of the persisted block", () => {
    const call = hookSource.match(/saveLayoutPrefs\(\{([\s\S]*?)\}\)/);
    expect(call).toBeTruthy();
    for (const flag of SESSION_ONLY_FLAGS) {
      expect(call![1], flag + " must stay session-only (D-06)").not.toContain(flag);
    }
  });

  it("seeds each toggle from the loaded preferences, not from a bare literal", () => {
    // Seeding from a literal would ignore what was restored on the first render.
    expect(hookSource, "the hook does not read the stored preferences").toMatch(
      /useState\(\(\) => loadLayoutPrefs\(\)\)/
    );
    for (const key of LAYOUT_BOOLEAN_KEYS) {
      expect(hookSource, key + " is not seeded from the loaded preferences").toContain(
        "bootPrefs." + key
      );
    }
  });

  it("is actually mounted by the studio, or the hook is dead code", () => {
    /**
     * The half that keeps the extraction honest. Moving behaviour into a well-tested hook and then
     * forgetting to call it is the failure mode a file-level guard cannot see: the hook's own tests
     * stay green while the app loses persistence entirely.
     */
    expect(studioSource).toContain("usePanelVisibility()");
    expect(studioSource).toContain("hooks/usePanelVisibility");
  });
});
