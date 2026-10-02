/**
 * The scratch root: where a GB-scale script writes, and whether that place can take it.
 *
 * These pin the rule that `scripts/upload_samples.mjs` broke when it used `os.tmpdir()` for a 2.6 GB mirror:
 * a configurable root (`--scratch` over `$TMPDIR` over an on-disk default), a **warning when the chosen root is
 * RAM-backed**, and cleanup that always runs. The mount fixtures below are `/proc/mounts` lines in its real format,
 * so the tmpfs decision is tested without depending on what this machine happens to mount.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_SCRATCH_ROOT,
  TMPFS_MAGIC,
  describeScratch,
  filesystemFor,
  flagValue,
  freeSpaceWarning,
  makeScratchDir,
  mountPointFor,
  parseMounts,
  ramBackedWarning,
  removeScratchDir,
  scratchRootFrom,
} from "../../scripts/lib/scratch.mjs";

/** `/proc/mounts`: `device mountpoint fstype options dump pass`. `/tmp` is the 7.8 GB tmpfs this machine has. */
const MOUNTS = [
  "/dev/sda2 / btrfs rw,noatime,compress=zstd:3 0 0",
  "tmpfs /tmp tmpfs rw,noatime,inode64,huge=advise 0 0",
  "/dev/sda2 /var/tmp btrfs rw,noatime,compress=zstd:3 0 0",
  "tmpfs /dev/shm tmpfs rw,nosuid,nodev 0 0",
  "tmpfs /mnt/with\\040space tmpfs rw 0 0",
].join("\n");

const factsFor = (target: string, freeBytes: number | null = null) => ({
  ...filesystemFor(target, { mountsText: MOUNTS }),
  root: path.resolve(target),
  freeBytes,
});

describe("scratchRootFrom", () => {
  it("lets --scratch win over TMPDIR, the way sort's -T wins over TMPDIR", () => {
    expect(scratchRootFrom({ argv: ["entry", "--scratch", "/mnt/big"], env: { TMPDIR: "/tmp" } })).toMatchObject({
      root: "/mnt/big",
      source: "--scratch",
    });
    expect(scratchRootFrom({ argv: ["entry", "--scratch=/mnt/big"], env: { TMPDIR: "/tmp" } }).root).toBe("/mnt/big");
  });

  it("honours TMPDIR when no flag is given, and says which rule chose the path", () => {
    expect(scratchRootFrom({ argv: ["entry"], env: { TMPDIR: "/data/scratch" } })).toMatchObject({
      root: "/data/scratch",
      source: "TMPDIR",
    });
  });

  it("defaults to the on-disk /var/tmp — not to os.tmpdir()'s /tmp — when nothing overrides it", () => {
    expect(scratchRootFrom({ argv: ["entry"], env: {}, platform: "linux" })).toMatchObject({
      root: DEFAULT_SCRATCH_ROOT,
      source: "default",
    });
    expect(DEFAULT_SCRATCH_ROOT).toBe("/var/tmp");
  });

  it("does not mistake a flag's value for an entry id", () => {
    expect(flagValue(["--scratch", "/var/tmp", "vsco2ce"], "scratch")).toBe("/var/tmp");
    expect(flagValue(["--scratch"], "scratch")).toBeUndefined();
    expect(flagValue(["vsco2ce"], "scratch")).toBeUndefined();
  });
});

describe("mount parsing", () => {
  it("takes the longest mount-point prefix, so a nested /var/tmp is not read as the root filesystem", () => {
    const mounts = parseMounts(MOUNTS);
    expect(mountPointFor("/var/tmp/groove-mirror-x", mounts)).toMatchObject({ mountPoint: "/var/tmp", fsType: "btrfs" });
    expect(mountPointFor("/tmp/groove-mirror-x", mounts)).toMatchObject({ mountPoint: "/tmp", fsType: "tmpfs" });
    expect(mountPointFor("/srv/data", mounts)).toMatchObject({ mountPoint: "/", fsType: "btrfs" });
  });

  it("unescapes the octal spaces /proc/mounts uses", () => {
    expect(mountPointFor("/mnt/with space/x", parseMounts(MOUNTS))?.mountPoint).toBe("/mnt/with space");
  });
});

describe("the tmpfs sentinel", () => {
  it("⭐ warns loudly when the scratch root is on a ram-backed mount", () => {
    const warning = ramBackedWarning(factsFor("/tmp/groove-mirror-virtuosity-drums-basic-x", 4 * 1024 ** 3));
    expect(warning).not.toBeNull();
    expect(warning).toContain("RAM-BACKED");
    expect(warning).toContain("/tmp");
    expect(warning).toContain("--scratch /var/tmp");
  });

  it("⭐ stays silent when the scratch root is on a disk", () => {
    expect(ramBackedWarning(factsFor("/var/tmp/groove-mirror-virtuosity-drums-basic-x", 130 * 1024 ** 3))).toBeNull();
  });

  it("treats /dev/shm the same way, because it is the same kind of mount", () => {
    expect(ramBackedWarning(factsFor("/dev/shm/scratch"))).toContain("RAM-BACKED");
  });

  it("cross-checks /proc against statfs on the real machine, so the two detection paths agree", () => {
    if (process.platform !== "linux" || !fs.existsSync("/proc/self/mounts")) return;
    for (const target of ["/tmp", "/var/tmp"]) {
      const byProc = filesystemFor(target, { mountsText: fs.readFileSync("/proc/self/mounts", "utf8") });
      const magic = fs.statfsSync(target).type;
      expect(byProc.ramBacked).toBe(magic === TMPFS_MAGIC);
    }
  });
});

describe("free space", () => {
  it("warns when the scratch filesystem has less room than the run plans to write", () => {
    expect(freeSpaceWarning(factsFor("/var/tmp", 1 * 1024 ** 3), 2.6 * 1024 ** 3)).toContain("ENOSPC");
  });

  it("stays silent when there is room", () => {
    expect(freeSpaceWarning(factsFor("/var/tmp", 130 * 1024 ** 3), 2.6 * 1024 ** 3)).toBeNull();
  });
});

describe("cleanup", () => {
  it("creates a unique directory under the chosen root and removes it again", () => {
    const dir = makeScratchDir(DEFAULT_SCRATCH_ROOT, "groove-scratch-test-");
    expect(dir.startsWith(DEFAULT_SCRATCH_ROOT)).toBe(true);
    expect(fs.existsSync(dir)).toBe(true);
    expect(removeScratchDir(dir)).toEqual({ ok: true });
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("describeScratch reads a real root without throwing", () => {
    const facts = describeScratch(DEFAULT_SCRATCH_ROOT);
    expect(facts.root).toBe(path.resolve(DEFAULT_SCRATCH_ROOT));
    expect(typeof facts.ramBacked).toBe("boolean");
  });
});
