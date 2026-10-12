/**
 * Whether a mirror run may start, decided **before** it starts — because the failure this prevents is discovering the ceiling halfway through an upload.
 *
 * R2 has a ceiling the owner set at 10 GB, and the libraries now planned for it are pianos and orchestras rather than one drum kit, so "how much would this send" is a number worth refusing on. The check is
 * deliberately a pure function over three numbers — **what would be sent, what is already stored, what the ceiling is** — so it can be run before any network call and asserted without one.
 *
 * **It reports all three numbers side by side.** A refusal that says only "over budget" leaves the person who set the budget unable to see by how much, which is the whole decision they would want to make.
 */
export interface MirrorBudget {
  /** Bytes this run intends to upload, computed from the manifest rather than discovered while sending. */
  plannedBytes: number;
  /** Bytes already in the bucket, from the bucket itself. */
  storedBytes: number;
  ceilingBytes: number;
}

export interface BudgetVerdict {
  allowed: boolean;
  /** A sentence naming all three numbers, so the decision to raise the ceiling is one a person can make at a glance. */
  summary: string;
}

/** Human-readable bytes, because "10737418240" is not a number anyone reasons about. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function checkMirrorBudget({ plannedBytes, storedBytes, ceilingBytes }: MirrorBudget): BudgetVerdict {
  const total = storedBytes + plannedBytes;
  const summary = `would send ${formatBytes(plannedBytes)}, ${formatBytes(storedBytes)} already stored, ceiling ${formatBytes(ceilingBytes)} → ${formatBytes(total)} of ${formatBytes(ceilingBytes)}`;

  // ⭐ `>=` rather than `>`: landing exactly on the ceiling leaves no room for the next library, and the ceiling is a limit the owner set rather than a target to reach.
  if (total >= ceilingBytes) return { allowed: false, summary: `${summary} — refused; raise the ceiling or drop a library before running` };
  return { allowed: true, summary };
}
