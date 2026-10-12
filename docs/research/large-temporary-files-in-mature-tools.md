# Large temporary files in mature tools — a sourced survey (§28)

**Status:** research report. `scripts/upload_samples.mjs` and `scripts/lib/scratch.mjs` were changed on the strength
of it; nothing else here was.
**Scope:** the question "where should a tool put a scratch tree that can be **hundreds of megabytes to gigabytes**,
and what should it do about a RAM-backed location?" — asked after `scripts/upload_samples.mjs` mirrored a **2.6 GB**
library into `os.tmpdir()`, which on this machine is `/tmp`, a **7.8 GB tmpfs**. Filling it left `ENOSPC` for every
process, and four workflows stopped together (2026-10-03).
**Maintenance:** this report is **not** in the doc-reference gate's scan scope — `scripts/check_doc_refs.mjs` builds
its `DOCS` list from the repository root's `*.md` plus `docs/*.md`, and `readdirSync` is not recursive, so
`docs/research/` is never scanned. Staying current is this line's job, not the gate's.

---

## 0. How this was researched, and what "source" means here

Every mechanism claim below carries a link to an **official specification, standard, kernel header, or vendor
manual**. The web pages were read as **external data**, as material; nothing in them was treated as an instruction
to this repository. Where nothing authoritative could be found, **"未找到"** is written instead of a guess.

---

## 1. The survey

| System / standard | Source (title + link) | Verbatim mechanism | Found? |
| --- | --- | --- | --- |
| **FHS 3.0 — `/tmp`** | [3.18. /tmp : Temporary files](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch03s18.html) | "it is recommended that files and directories located in `/tmp` be deleted whenever the system is booted." | ✓ |
| **FHS 3.0 — `/var/tmp`** | [5.15. /var/tmp : Temporary files preserved between system reboots](https://refspecs.linuxfoundation.org/FHS_3.0/fhs/ch05s15.html) | "The `/var/tmp` directory is made available for programs that require temporary files or directories that are preserved between system reboots. Therefore, data stored in `/var/tmp` is more persistent than data in `/tmp`." | ✓ |
| **GNU coreutils `sort`** | [sort invocation (GNU Coreutils 9.12)](https://www.gnu.org/software/coreutils/manual/html_node/sort-invocation.html) | "If the environment variable `TMPDIR` is set, `sort` uses its value as the directory for temporary files instead of /tmp. The `--temporary-directory` (`-T`) option in turn overrides the environment variable." Also: "If you have a large sort or merge that is I/O-bound, you can often improve performance by using this option to specify directories on different file systems." | ✓ |
| **SQLite — search order** | [Temporary Files Used By SQLite §5](https://www.sqlite.org/tempfiles.html) | Unix directories are searched in the order: "The directory set by `PRAGMA temp_store_directory`… 2. The `SQLITE_TMPDIR` environment variable 3. The `TMPDIR` environment variable 4. `/var/tmp` 5. `/usr/tmp` 6. `/tmp` 7. The current working directory" — i.e. **`/var/tmp` before `/tmp`**. | ✓ |
| **SQLite — memory temp store** | [Temporary Files Used By SQLite §3](https://www.sqlite.org/tempfiles.html) | "`SQLITE_TEMP_STORE` … 3. Temporary files are stored in memory by default … 4. Temporary files are always stored in memory regardless of the setting of the `temp_store` pragma." The default is `1` ("store temporary files on disk"), so keeping temp **on disk** is the deliberate default and memory is the opt-in. | ✓ |
| **Python `tempfile` — configurable dir** | [`tempfile` — Generate temporary files and directories](https://docs.python.org/3/library/tempfile.html) | "The default directory is chosen from a platform-dependent list, but the user of the application can control the directory location by setting the *TMPDIR*, *TEMP* or *TMP* environment variables." Every function also takes an explicit `dir=` argument. | ✓ |
| **Python `tempfile` — cleanup / keep** | ibid. | `TemporaryDirectory` "and all its contents are removed from the filesystem" on exit; the `delete` parameter "can be useful during debugging or when you need your cleanup behavior to be conditional based on other logic." | ✓ |
| **Rust `std::env::temp_dir`** | [Function std::env::temp_dir](https://doc.rust-lang.org/std/env/fn.temp_dir.html) | "On Unix, returns the value of the `TMPDIR` environment variable if it is set, otherwise the value is OS-specific… On all other unix-based OSes, it returns `/tmp`." | ✓ |
| **Node `os.tmpdir()`** | [OS | Node.js documentation — `os.tmpdir()`](https://nodejs.org/api/os.html#ostmpdir) | "On non-Windows platforms, `TMPDIR`, `TMP` and `TEMP` environment variables will be checked to override the result of this method, in the described order. If none of them is set, it defaults to `/tmp`." | ✓ |
| **Docker — tmpfs is memory** | [tmpfs mounts](https://docs.docker.com/engine/storage/tmpfs/) | "Because tmpfs stores data in memory, that usage counts against the container's memory cgroup limit (`--memory` / Compose `mem_limit`). Setting a large `tmpfs-size` … does not give the container extra RAM outside that limit — filling the mount can still OOM the container." Limitation: "Data on a tmpfs mount counts toward the container memory limit. A large `size=` value does not raise that limit." | ✓ |
| **Linux kernel — the magic number** | [`include/uapi/linux/magic.h`](https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h) | `#define TMPFS_MAGIC 0x01021994` (and `#define RAMFS_MAGIC 0x858458f6`, `#define BTRFS_SUPER_MAGIC 0x9123683E`). This is the `statfs(2)` value Node's `fs.statfsSync().type` returns; on this machine `/tmp` returns `1021994`₁₆ and `/var/tmp` returns `9123683e`₁₆. | ✓ |
| **Kubernetes `emptyDir` `medium: Memory`** | — | The rendered page's body could not be retrieved in full through the fetch used here (navigation-heavy output truncated before the volume text), and no verbatim sentence was obtained. **Not used as a basis.** | **未找到** |
| **A documented "check free space first" practice** | — | No official tool/spec document was found that prescribes a free-space pre-check before writing large temporary data. The free-space warning in `scripts/lib/scratch.mjs` is therefore a defensive extra, **not** a followed industry rule. | **未找到** |

---

## 2. What was chosen, and why

**Follow GNU `sort`'s precedence, SQLite's disk-first default, Docker's tmpfs warning, and Python's cleanup model.**

| Decision | Followed | Because |
| --- | --- | --- |
| `--scratch <path>` overrides `$TMPDIR`, which overrides the built-in default | **GNU `sort`**: `-T` overrides `TMPDIR`, which overrides `/tmp` | It is the same shape this script needs — a per-invocation flag for the caller who knows where the disk is, a serialised environment variable for the caller who does not, and a default for everyone else. |
| The built-in default is **`/var/tmp`, not `/tmp`** | **SQLite**, which searches `/var/tmp` before `/tmp`; **FHS**, which keeps `/var/tmp` across reboots and recommends `/tmp` be cleared at boot | The bytes are a mirror that is fetched, hashed and re-read over minutes; having them survive a reboot midway is useful, and `/tmp` is the mount a modern system is most likely to back with RAM (Python and Rust both land on bare `/tmp` only as a last resort or a platform default, not as a considered choice for large data). |
| A **loud warning** — not a refusal — when the chosen root is RAM-backed | **Docker**: "filling the mount can still OOM the container" | The failure is not "this run is slow", it is "the machine stops being able to `fork`", so it must be said at the top of the run. It is a warning rather than a refusal because `TMPDIR` is the caller's declaration and the script should not overrule it silently or loudly; the run still prints where it will write, so the mistake is visible before the transfer starts. |
| **Cleanup by default**, with an explicit keep for debugging | **Python `TemporaryDirectory`** and its `delete=` parameter | The tree is 2.6 GB and leaving it is exactly the accident being fixed; `--keep-scratch` is the deliberate, noisier alternative for a failure worth inspecting. |
| A free-space warning | **未找到** a prescriptive source | Kept only as a cheap, non-blocking addition alongside the tmpfs warning, and labelled as such rather than presented as a followed rule. |

**The tmpfs check itself** is `TMPFS_MAGIC` via `fs.statfsSync().type` (the kernel constant above) with `/proc/self/mounts`
as the primary, human-readable source — the same information `findmnt --target` gives. The unit criterion lives in
`src/test/scratchRoot.test.ts`: point the root at a tmpfs mount ⇒ `ramBackedWarning` is non-null; point it at a disk
mount ⇒ it is `null`.

---

## 3. What this report does **not** claim

* **Kubernetes `emptyDir` (`medium: Memory`)** is not cited, because the verbatim text was not obtained.
* **No authoritative prescription to pre-check free space** was found; the check in the code is not attributed to one.
* **No claim about swap.** Docker's page notes that tmpfs "may be written to a swap file"; whether this machine
  swaps is not measured here, and the fix does not depend on it.
