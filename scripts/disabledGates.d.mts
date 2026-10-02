/**
 * Types for `scripts/disabledGates.mjs` — the ledger of temporarily disabled gates.
 *
 * A declaration file beside the implementation, exactly as `scripts/lib/*.d.mts` does it: the gate
 * scripts are plain Node ESM, the unit criterion (`src/test/disabledGates.test.ts`) is TypeScript,
 * and both must read the same list.
 */

/** One disabled gate, with the three facts the owner asked for. */
export interface DisabledGate {
  /** The npm script id — the entry point the guard is wired into. */
  id: string;
  /** The gate's own file, which must still exist: a gate is disabled, never deleted. */
  entry: string;
  /** One sentence saying what the gate judges. */
  what: string;
  /** Why it cannot see reality: no catalogue reaches the render, so it is blind to the sampling path. */
  why: string;
  /** Whether it is red today, and on what evidence. */
  todayRed: string;
  /** The concrete condition under which it comes back: catalogue into the render, baseline re-recorded. */
  returnsWhen: string;
  /** Who decided, and when. */
  decidedBy: string;
}

export declare const DISABLED_GATE_GUARD: string;
export declare const DISABLED_GATES: DisabledGate[];
export declare const NEVER_DISABLED: string[];
export declare function disabledGate(id: string): DisabledGate | null;
export declare function disabledGateNotice(entry: DisabledGate): string;
export declare function auditDisabledGates(root?: string): {
  problems: string[];
  oks: string[];
  wrapped: string[];
  listed: string[];
};
