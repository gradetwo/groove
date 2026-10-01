/**
 * GS-1 share codes: the synth project's own patch format, **read** here rather than reinvented.
 *
 * ## Why this file is a reader and not a second format
 *
 * A caller who wants a GS-1 sound hands us the same string the synth's own MCP hands out:
 * `gs1.patch.get` returns a **share code**, `gs1.patch.set`/`gs1.render` accept one, and the
 * synth's `src/state/share.ts` (`encodePatch`/`decodePatch`) is what both sides use. The code is
 * an opaque base64url JSON payload — `gs1.1.` + `btoa` of `{ s, v, r, p2?, m?, sn? }` — where
 * `v` is one value per parameter id in ascending order.
 *
 * Vendoring `share.ts` itself is not an option: it imports `src/state/persist.ts` (for
 * `SCHEMA_VERSION`) and `src/midi/takes.ts`, so copying it would drag a second half of the synth
 * app into `vendor/gs1/` and break the one-file-one-hash pin. What is reusable is the **format**,
 * and the parameter table is already vendored byte-identically (`vendor/gs1/src/audio/params.ts`,
 * see `UPSTREAM.json`). This module therefore mirrors `parsePayload` exactly, and every rejection
 * below is a case where upstream's `decodePatch` returns `null` — plus the two cases where
 * upstream would silently drop what the caller asked for:
 *
 *   * a `gs1.2.` code (deflated — only an arrangement-bearing code produces one);
 *   * a code with a **second layer** (`p2`), which this renderer cannot play: `Gs1Host` is one
 *     instance, while a layered code asks for two.
 *
 * ## What is deliberately **not** validated, and the measurement that says so
 *
 * Parameter **ranges** are not checked here. `PARAM_SPECS` in the vendored table covers only 84 of
 * the 224 parameters, and where it does overlap the worklet's served range it is *narrower*, not
 * equal. Measured against all 91 factory presets by encoding each with the synth's own
 * `presetShareCode` and decoding it: exactly one value — `phonk`'s `osc2Pitch = 31` — falls outside
 * its `PARAM_SPECS` range, whose declared bound is ±24 while the worklet actually serves ±48. A
 * range check written against `PARAM_SPECS` would therefore reject a factory preset the synth
 * itself produces. The browser's `AudioParam` clamps to the served range exactly as it does inside
 * the synth, so the honest validation is the one upstream performs: **is this a decodable code**.
 */
import { DEFAULT_PARAMS } from "../../../vendor/gs1/src/audio/params";

/** The plain share-code prefix (`PREFIX` in the synth's `src/state/share.ts`). */
export const GS1_PATCH_PREFIX = "gs1.1.";
/** The deflated prefix, written only when a code carries a whole arrangement. */
export const GS1_PATCH_PREFIX_DEFLATE = "gs1.2.";
/**
 * The payload schema this reader understands — `SCHEMA_VERSION` in the synth's
 * `src/state/persist.ts`. A code that declares a newer one is refused rather than decoded
 * positionally into the wrong parameters, exactly as upstream does.
 */
export const GS1_PATCH_SCHEMA = 4;

/** One modulation route, in the **integer** wire form `Gs1Host.setModRoute` takes. */
export interface Gs1PatchRoute {
  src: number;
  dst: number;
  amount: number;
  enabled: boolean;
}

/** What a share code says: a full parameter record plus its modulation routes. */
export interface DecodedGs1Patch {
  /** Every parameter id the code carried, defaulted from the vendored table for the rest. */
  params: Record<number, number>;
  routes: Gs1PatchRoute[];
}

/** The reader's answer: the patch, or the reason it was refused. Never `null` and never silent. */
export type Gs1PatchCodeResult =
  | { ok: true; patch: DecodedGs1Patch }
  | { ok: false; problem: string };

/**
 * Ascending parameter ids — the **positions** of `v` in a share code.
 *
 * This ordering is the format: `buildPayload` sorts `Object.keys(DEFAULT_PARAMS)` and
 * `parsePayload` reads back against the same list. The list is built from the vendored table, so a
 * re-sync that appends a parameter cannot shift an old code's values — ids are append-only
 * upstream, and this is where that contract is spent.
 */
const PARAM_IDS: number[] = Object.keys(DEFAULT_PARAMS)
  .map(Number)
  .sort((a, b) => a - b);

/** `base64UrlDecode` from the synth's `share.ts`, including its replacement-character behaviour. */
function base64UrlDecode(code: string): string | null {
  try {
    const padded = code.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(code.length / 4) * 4, "=");
    return decodeURIComponent(escape(atob(padded)));
  } catch {
    return null;
  }
}

/**
 * Read a GS-1 share code into parameters and routes, or say why it cannot be read.
 *
 * Pure and total: every input produces `{ ok: true }` or a `problem` a caller can put in front of
 * a person, which is the whole point — the alternative is `resolveGs1Patch`'s total fallback to
 * the native engine, where a typo in a patch name changes the instrument and says nothing.
 */
export function decodeGs1PatchCode(code: unknown): Gs1PatchCodeResult {
  if (typeof code !== "string" || code.trim() === "") {
    return { ok: false, problem: "a GS-1 patch must be a non-empty share-code string" };
  }
  if (code.startsWith(GS1_PATCH_PREFIX_DEFLATE)) {
    return {
      ok: false,
      problem:
        'this is a compressed "gs1.2." arrangement code, not a patch — a patch code is "gs1.1." (gs1.patch.get prints one)',
    };
  }
  if (!code.startsWith(GS1_PATCH_PREFIX)) {
    return {
      ok: false,
      problem: `not a GS-1 share code: it must start with "${GS1_PATCH_PREFIX}" (got "${code.slice(0, 12)}…")`,
    };
  }

  const json = base64UrlDecode(code.slice(GS1_PATCH_PREFIX.length));
  if (json === null) return { ok: false, problem: "the code's payload is not valid base64url" };

  let parsed: { s?: unknown; v?: unknown; r?: unknown; p2?: unknown };
  try {
    parsed = JSON.parse(json) as typeof parsed;
  } catch {
    return { ok: false, problem: "the code's payload is not JSON" };
  }

  if (!Array.isArray(parsed.v)) return { ok: false, problem: "the code carries no parameter vector (`v`)" };

  // A code written before versioning carries no `s`; upstream reads that as schema 1.
  const schema = typeof parsed.s === "number" ? parsed.s : 1;
  if (!Number.isFinite(schema) || schema > GS1_PATCH_SCHEMA) {
    return {
      ok: false,
      problem: `the code declares schema ${String(parsed.s)}, newer than the ${GS1_PATCH_SCHEMA} this build understands`,
    };
  }

  if (parsed.p2 !== undefined) {
    return {
      ok: false,
      problem: "the code carries a second layer/split (`p2`), and this renderer plays one GS-1 instance",
    };
  }

  const params: Record<number, number> = { ...DEFAULT_PARAMS };
  for (let index = 0; index < parsed.v.length; index += 1) {
    const value = parsed.v[index];
    // Upstream skips a non-finite value in silence; a code with one is broken, not merely old.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return { ok: false, problem: `value ${index} in the code's parameter vector is not a finite number` };
    }
    const id = PARAM_IDS[index];
    // Beyond the table: append-only, so these are parameters from a newer synth build. Upstream
    // ignores them, and ignoring them cannot mis-map an id that this build does know.
    if (id === undefined) continue;
    params[id] = value;
  }

  const routes: Gs1PatchRoute[] = [];
  if (parsed.r !== undefined && !Array.isArray(parsed.r)) {
    return { ok: false, problem: "the code's routing (`r`) is not an array" };
  }
  for (const entry of (parsed.r ?? []) as unknown[]) {
    if (!Array.isArray(entry) || entry.length < 3) {
      return { ok: false, problem: "the code carries a malformed modulation route" };
    }
    const src = Number(entry[0]);
    const dst = Number(entry[1]);
    const amount = Number(entry[2]);
    if (!Number.isFinite(src) || !Number.isFinite(dst) || !Number.isFinite(amount)) {
      return { ok: false, problem: "the code carries a modulation route with a non-finite value" };
    }
    routes.push({ src, dst, amount, enabled: Boolean(entry[3]) });
  }

  return { ok: true, patch: { params, routes } };
}
