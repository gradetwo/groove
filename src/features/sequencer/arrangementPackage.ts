import { APP_VERSION } from "../../version";
import type { ArrangementV2 } from "../../types/arrangementV2";

/**
 * ⭐ **The v2 package: an arrangement, and nothing of the older model.**
 *
 * The owner's decision is that the package carries tracks, notes, takes, bars and a tempo map, and carries no clips, slots
 * or sections. The validator below enforces exactly that, which is what makes this a v2 shape rather than the older one
 * with a new name: a package that carries the old keys is refused, not accepted, so the two cannot coexist.
 */
export const ARRANGEMENT_PACKAGE_FORMAT = "groove-arrangement";

export interface ArrangementPackage {
  format: typeof ARRANGEMENT_PACKAGE_FORMAT;
  appVersion: string;
  /** ⭐ Who wrote it and when, so a file found later still explains itself. */
  writtenAt: string;
  arrangement: ArrangementV2;
}

/** ⭐ The v1 keys whose presence means the package is not a v2 one. */
const OLD_SHAPE_KEYS = ["clips", "slots", "sections", "project"] as const;

export function buildArrangementPackage(
  arrangement: ArrangementV2,
  appVersion: string = APP_VERSION,
  writtenAt: string = new Date().toISOString()
): ArrangementPackage {
  return { format: ARRANGEMENT_PACKAGE_FORMAT, appVersion, writtenAt, arrangement };
}

/**
 * ⭐ **Refuse the old shape rather than tolerate it.** A tolerant validator would let both live, which is the thing the
 * decision forbids; the error names the key it found so the caller learns which shape it holds.
 */
export function validateArrangementPackage(data: unknown): ArrangementPackage {
  if (!data || typeof data !== "object") throw new Error("Invalid arrangement package: not an object");
  const pkg = data as Record<string, unknown>;
  if (pkg.format !== ARRANGEMENT_PACKAGE_FORMAT) {
    throw new Error(`Invalid arrangement package: format is ${String(pkg.format)}, expected ${ARRANGEMENT_PACKAGE_FORMAT}`);
  }
  if (typeof pkg.appVersion !== "string" || !pkg.appVersion) {
    throw new Error("Invalid arrangement package: appVersion is missing");
  }
  const arrangement = pkg.arrangement as Record<string, unknown> | undefined;
  if (!arrangement || typeof arrangement !== "object") {
    throw new Error("Invalid arrangement package: arrangement is missing");
  }
  const found = OLD_SHAPE_KEYS.filter((key) => key in arrangement || key in pkg);
  if (found.length) {
    throw new Error(`Invalid arrangement package: it carries the v1 shape (${found.join(", ")})`);
  }
  if (!Array.isArray(arrangement.tracks)) {
    throw new Error("Invalid arrangement package: arrangement is missing its tracks");
  }
  return pkg as unknown as ArrangementPackage;
}
