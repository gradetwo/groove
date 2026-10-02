/**
 * Where a script that writes hundreds of megabytes puts its scratch work — and whether that place can take it.
 *
 * ⭐ **This module exists because `os.tmpdir()` chose a 7.8 GB RAM disk.** `scripts/upload_samples.mjs` mirrored a
 * 2.6 GB library into `os.tmpdir()` — `/tmp`, a tmpfs on this machine — and filled it. The failure is not scoped to
 * the run: once a tmpfs is full, `fork`/`exec` fail with `ENOSPC` for every process on the box, which is how four
 * workflows stopped at once on 2026-10-03.
 *
 * The rule implemented here is the one mature tools already use (§28 of the working standards):
 *
 *   · **a configurable scratch root, with a flag overriding the environment** — GNU `sort`: "If the environment
 *     variable `TMPDIR` is set, `sort` uses its value as the directory for temporary files instead of /tmp. The
 *     `--temporary-directory` (`-T`) option in turn overrides the environment variable."
 *     <https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html>
 *   · **a disk-backed default** — SQLite's Unix VFS searches `/var/tmp` **before** `/tmp`
 *     (<https://www.sqlite.org/tempfiles.html> §5), and the FHS keeps `/var/tmp` for data "preserved between system
 *     reboots" while recommending files in `/tmp` "be deleted whenever the system is booted"
 *     (<https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s18.html>,
 *     <https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch05s15.html>).
 *   · **a loud warning when the chosen root is RAM-backed** — Docker documents the hazard exactly: "Because tmpfs
 *     stores data in memory, that usage counts against the container's memory cgroup limit … filling the mount can
 *     still OOM the container." (<https://docs.docker.com/engine/storage/tmpfs/>)
 *   · **cleanup by default, with an explicit keep for debugging** — Python's `tempfile.TemporaryDirectory` removes
 *     the tree on exit, and its `delete` parameter "can be useful during debugging or when you need your cleanup
 *     behavior to be conditional on other logic." (<https://docs.python.org/3/library/tempfile.html>)
 *
 * The full survey is in `docs/research/large-temporary-files-in-mature-tools.md`.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/** ⭐ The on-disk default. `/tmp` is the one modern systems are most likely to back with RAM, so it is not it. */
export const DEFAULT_SCRATCH_ROOT = "/var/tmp";

/**
 * The kernel's filesystem magic numbers, so a RAM-backed root is recognised even when `/proc` is unreadable.
 * `TMPFS_MAGIC` is what `fs.statfsSync()` returns for `/tmp` and `/dev/shm`; both constants are from the kernel's own
 * header (<https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h>).
 */
export const TMPFS_MAGIC = 0x01021994;
export const RAMFS_MAGIC = 0x858458f6;
const RAM_BACKED_MAGIC = new Set([TMPFS_MAGIC, RAMFS_MAGIC]);
const RAM_BACKED_FS = new Set(["tmpfs", "ramfs", "devtmpfs"]);

/**
 * The value of `--name value` or `--name=value`, or `undefined`.
 *
 * ⭐ **Needed because a flag's value does not look like a flag.** `upload_samples.mjs` used to take its entry id as
 * "the first argument that is not a flag", so `--scratch /var/tmp` would have made `/var/tmp` the *entry*.
 */
export function flagValue(argv, name) {
  const withEquals = argv.find((a) => a.startsWith(`--${name}=`));
  if (withEquals !== undefined) return withEquals.slice(name.length + 3);
  const at = argv.indexOf(`--${name}`);
  if (at !== -1 && argv[at + 1] !== undefined && !argv[at + 1].startsWith("--")) return argv[at + 1];
  return undefined;
}

/**
 * ⭐ **Precedence: `--scratch` > `$TMPDIR` > the on-disk default** — GNU `sort`'s order exactly (`-T` overrides
 * `TMPDIR`, which overrides the built-in `/tmp`). `TMPDIR` is honoured even when it names a tmpfs; that is the
 * caller's decision, and {@link ramBackedWarning} says what it costs.
 */
export function scratchRootFrom({ argv = process.argv.slice(2), env = process.env, platform = process.platform } = {}) {
  const flag = flagValue(argv, "scratch");
  if (flag !== undefined && flag !== "") {
    return { root: path.resolve(flag), source: "--scratch", detail: `--scratch ${flag}` };
  }
  if (env.TMPDIR) {
    return { root: path.resolve(env.TMPDIR), source: "TMPDIR", detail: `TMPDIR=${env.TMPDIR}` };
  }
  // Windows has no /var/tmp; there `os.tmpdir()` is at least a real path. Everywhere else the disk default wins.
  const fallback = platform === "win32" ? os.tmpdir() : DEFAULT_SCRATCH_ROOT;
  return { root: path.resolve(fallback), source: "default", detail: `the built-in default (${DEFAULT_SCRATCH_ROOT})` };
}

/** `/proc/mounts` escapes space, tab, newline and backslash as `\040`, `\011`, `\012`, `\134`. */
function unescapeMountField(field) {
  return field.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

/** Parse `/proc/mounts` (or `/proc/self/mounts`): `device mountpoint fstype options dump pass`. */
export function parseMounts(text) {
  const mounts = [];
  for (const line of String(text).split("\n")) {
    if (line.trim() === "") continue;
    const fields = line.split(" ");
    if (fields.length < 3) continue;
    mounts.push({ mountPoint: unescapeMountField(fields[1]), fsType: fields[2] });
  }
  return mounts;
}

/**
 * The filesystem a path lives on, by longest mount-point prefix — the same answer `findmnt --target` gives.
 *
 * ⭐ **Longest, not first.** `/var/tmp` is itself a mount here, and a first-match search would have returned the
 * btrfs root for it and missed nothing — but a first-match search returns the wrong *mount* for any nested mount,
 * and the fsType of the mount that actually holds the bytes is the whole question.
 */
export function mountPointFor(target, mounts) {
  const abs = path.resolve(target);
  let best = null;
  for (const mount of mounts) {
    const point = mount.mountPoint;
    const holds = abs === point || abs.startsWith(point === "/" ? "/" : `${point}/`);
    if (holds && (best === null || point.length > best.mountPoint.length)) best = mount;
  }
  return best;
}

/** RAM-backed means "the bytes are the page cache", which is the property that makes a full disk kill the machine. */
export function isRamBackedFsType(fsType) {
  return typeof fsType === "string" && RAM_BACKED_FS.has(fsType);
}

/** Map a `statfs(2)` magic number onto the fstype name, so the two detection paths agree. */
export function fsTypeFromMagic(magic) {
  if (magic === TMPFS_MAGIC) return "tmpfs";
  if (magic === RAMFS_MAGIC) return "ramfs";
  return `magic:0x${(Number(magic) >>> 0).toString(16)}`;
}

function readMountsText() {
  for (const file of ["/proc/self/mounts", "/proc/mounts"]) {
    try {
      return fs.readFileSync(file, "utf8");
    } catch {
      // No /proc (macOS, a jail): fall through to statfs.
    }
  }
  return null;
}

/** Which filesystem a path lands on, given the mount table. Pure, so the tmpfs rule is testable without `/tmp`. */
export function filesystemFor(target, { mountsText = null } = {}) {
  const abs = path.resolve(target);
  const mounts = mountsText === null ? [] : parseMounts(mountsText);
  const mount = mountPointFor(abs, mounts);
  if (mount) return { mountPoint: mount.mountPoint, fsType: mount.fsType, ramBacked: isRamBackedFsType(mount.fsType) };
  return { mountPoint: abs, fsType: null, ramBacked: false };
}

/**
 * Everything the caller needs to decide whether the root is safe, read from the live system: the mount table, a
 * `statfs` fallback for hosts without `/proc`, and the free space. Never throws — a root that cannot be inspected is
 * reported as `fsType: null`, not as an error that stops a run that would otherwise work.
 */
export function describeScratch(root) {
  const abs = path.resolve(root);
  const facts = filesystemFor(abs, { mountsText: readMountsText() });
  let statfs = null;
  if (typeof fs.statfsSync === "function") {
    try {
      statfs = fs.statfsSync(abs);
    } catch {
      statfs = null; // the directory does not exist yet, or the platform has no statfs
    }
  }
  if (facts.fsType === null && statfs) facts.fsType = fsTypeFromMagic(statfs.type);
  facts.root = abs;
  facts.ramBacked = isRamBackedFsType(facts.fsType);
  facts.freeBytes = statfs ? Number(statfs.bavail) * Number(statfs.bsize) : null;
  return facts;
}

/** The same "GB / MB" rendering `upload_samples.mjs` prints, so a warning and the budget block read alike. */
export function formatBytes(bytes) {
  const GB = 1024 ** 3;
  const MB = 1024 ** 2;
  if (bytes === null || bytes === undefined) return "unknown";
  return bytes >= GB ? `${(bytes / GB).toFixed(2)} GB` : `${(bytes / MB).toFixed(1)} MB`;
}

/**
 * ⭐ **The sentinel.** Non-null exactly when the scratch root is RAM-backed — the test in
 * `src/test/scratchRoot.test.ts` is "point it at a tmpfs mount ⇒ there is a warning; point it at a disk mount ⇒
 * there is not".
 */
export function ramBackedWarning(facts) {
  if (!facts.ramBacked) return null;
  const free = facts.freeBytes === null || facts.freeBytes === undefined ? "free space unknown" : `${formatBytes(facts.freeBytes)} free`;
  return [
    `⚠️  SCRATCH IS ON A RAM-BACKED FILESYSTEM (${facts.fsType}) — this run writes GB-scale work there`,
    `    scratch root : ${facts.root}`,
    `    mounted from : ${facts.mountPoint} (${facts.fsType}), ${free}`,
    "    A tmpfs lives in RAM. Filling it does not only fail this run: every process on the",
    "    machine starts failing with ENOSPC, which is how four workflows stopped at once on 2026-10-03.",
    "    Point the scratch root at a disk instead:",
    "      node scripts/upload_samples.mjs <entry> --scratch /var/tmp",
    "      TMPDIR=/var/tmp node scripts/upload_samples.mjs <entry>",
  ].join("\n");
}

/**
 * The second check the research asked for: is there room for what is about to be written? A warning rather than a
 * refusal, because the planned size is an estimate and a script that refuses on a bad estimate is one people work
 * around.
 */
export function freeSpaceWarning(facts, plannedBytes) {
  if (facts.freeBytes === null || facts.freeBytes === undefined) return null;
  if (!Number.isFinite(plannedBytes) || plannedBytes <= 0) return null;
  if (facts.freeBytes >= plannedBytes) return null;
  return [
    `⚠️  only ${formatBytes(facts.freeBytes)} free on ${facts.mountPoint} (${facts.fsType ?? "unknown"}) — this run plans ~${formatBytes(plannedBytes)}`,
    "    expect ENOSPC; move the scratch root with --scratch <path> or TMPDIR=<path>",
  ].join("\n");
}

/** Create the root if needed, then a unique directory in it. Returns the absolute scratch directory. */
export function makeScratchDir(root, prefix) {
  fs.mkdirSync(root, { recursive: true });
  return fs.mkdtempSync(path.join(root, prefix));
}

/**
 * ⭐ **Cleanup is best-effort and never throws**, because it runs in a `finally`: a removal that fails must not
 * replace the real error with its own. The caller decides what to say when `ok` is false.
 */
export function removeScratchDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
