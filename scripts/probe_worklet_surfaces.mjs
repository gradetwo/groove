#!/usr/bin/env node
/**
 * **Does a render say when it ran without worklets — on the right origin, and only on the right origin?**
 *
 * `docs/WORKLET_AVAILABILITY.md` measured that `AudioWorklet` is exposed only in a secure context: `http://127.0.0.1:<port>`
 * is one, a plain-HTTP LAN address is not. On the non-secure side the master limiter silently becomes a
 * `DynamicsCompressor` and GS-1 lanes are voiced by the native engine — and until this work the render said nothing.
 *
 * This probe drives the real app modules in a real Chromium on **both** origins and reads the render's own `problems`
 * list, so the two halves of the criterion are measured rather than argued:
 *
 *   · `http://127.0.0.1:<port>` — `ctx.audioWorklet` present, `limiterKind=worklet`, **no** worklet problem;
 *   · `http://<LAN-IP>:<port>` — `ctx.audioWorklet` absent, `limiterKind=fallback`, the worklet problem present.
 *
 * The second half is as important as the first: a warning that also fires on a secure origin is noise.
 *
 * **The page is loaded for real, not intercepted.** The first version of this probe fulfilled a minimal HTML document
 * through `page.route`, and the LAN page then could not import a single app module: Chromium blocked the request as
 * Private Network Access (`The request client is not a secure context and the resource is in more-private address space
 * 'local'`), because an intercepted navigation has no remote endpoint to classify and defaults to a less-private
 * address space. That was the probe measuring its own interception, so the navigation is real.
 *
 * Exit codes: 0 = both origins behave as stated, 1 = at least one did not, 3 = the watchdog fired (hung).
 *
 *     node scripts/probe_worklet_surfaces.mjs
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installWatchdog } from "./lib/watchdog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function aFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error("no free port"))));
    });
  });
}

/** The LAN address a person would actually open the app from, if this machine has one. */
function lanAddress() {
  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family === "IPv4" && !address.internal) return address.address;
    }
  }
  return null;
}

const port = await aFreePort();
const viteBin = path.join(ROOT, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteBin)) {
  console.error(`❌ cannot run: ${viteBin} not found — run from the repository root`);
  process.exit(1);
}

// `--host 0.0.0.0` is required: the LAN origin only exists if Vite listens beyond loopback.
const child = spawn(process.execPath, [viteBin, "--host", "0.0.0.0", "--port", String(port), "--strictPort"], {
  cwd: ROOT,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let browser = null;
const cleanup = async () => {
  await browser?.close().catch(() => undefined);
  if (!child.killed) child.kill("SIGTERM");
};
installWatchdog({ ms: 8 * 60_000, label: "probe_worklet_surfaces", onTimeout: cleanup });

const failures = [];
const check = (label, ok, detail) => {
  console.log(`${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(label);
};

try {
  await new Promise((resolve, reject) => {
    let output = "";
    const onData = (chunk) => {
      output += chunk.toString();
      if (/Local:\s+http/.test(output) || /ready in/.test(output)) resolve();
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => reject(new Error(`vite exited early (${code}):\n${output}`)));
    setTimeout(() => reject(new Error(`vite did not become ready in 60s:\n${output}`)), 60_000);
  });

  const lan = lanAddress();
  if (!lan) {
    console.error("❌ no non-internal IPv4 address on this machine — the non-secure half cannot be measured here");
    process.exit(1);
  }

  const { chromium } = await import("playwright");
  browser = await chromium.launch({ args: ["--no-sandbox"] });

  /**
   * One render on one origin, through the app's own renderer module — the same dynamic import `mcp/render/worker.ts`
   * makes, so this measures the shipped path and not a copy of it.
   */
  const renderOn = async (origin) => {
    const page = await browser.newPage();
    try {
      // A real navigation to the app's own dev-server origin — see the header note on Private Network Access.
      await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      return await page.evaluate(async () => {
        const specifier = (value) => value;
        const wav = await import(/* @vite-ignore */ specifier("/src/audio/WavExporter.ts"));
        const pattern = {
          genre_id: "probe",
          bpm: 120,
          scale: "minorPentatonic",
          tracks: [{ name: "Kick", track_id: "kick", instrument: "kick", steps: [1, 0, 0, 0], volume: 0.9, pan: 0 }],
        };
        const problems = [];
        let limiterKind = "?";
        const buffer = await wav.renderPatternOffline(pattern, {
          bars: 1,
          onProblems: (list) => problems.push(...list),
          onLimiterKind: (kind) => {
            limiterKind = kind;
          },
        });
        let ctxWorklet = "unreadable";
        try {
          const probe = new OfflineAudioContext(1, 128, 44100);
          ctxWorklet = typeof probe.audioWorklet;
        } catch (error) {
          ctxWorklet = `error:${String(error)}`;
        }
        return { origin: location.origin, secure: window.isSecureContext, ctxWorklet, limiterKind, problems, frames: buffer.length };
      });
    } finally {
      await page.close().catch(() => undefined);
    }
  };

  const loopback = await renderOn(`http://127.0.0.1:${port}`);
  console.log(`\n127.0.0.1  secure=${loopback.secure} ctx.audioWorklet=${loopback.ctxWorklet} limiterKind=${loopback.limiterKind} frames=${loopback.frames}`);
  console.log(`           problems=${JSON.stringify(loopback.problems)}`);
  const lanResult = await renderOn(`http://${lan}:${port}`);
  console.log(`\n${lan}  secure=${lanResult.secure} ctx.audioWorklet=${lanResult.ctxWorklet} limiterKind=${lanResult.limiterKind} frames=${lanResult.frames}`);
  console.log(`           problems=${JSON.stringify(lanResult.problems)}`);

  const workletProblem = (result) => result.problems.some((problem) => /without audio worklets/.test(problem));

  check("127.0.0.1 is a secure context the browser gives worklets", loopback.secure === true && loopback.ctxWorklet === "object", `ctx.audioWorklet=${loopback.ctxWorklet}`);
  check("a worklet-capable render does NOT report the worklet problem", workletProblem(loopback) === false);
  check("the LAN origin is not secure and has no worklets", lanResult.secure === false && lanResult.ctxWorklet === "undefined", `secure=${lanResult.secure} ctx.audioWorklet=${lanResult.ctxWorklet}`);
  check("a render without worklets DOES report it", workletProblem(lanResult) === true);
  check("the non-secure render names the secure-context cause", lanResult.problems.some((problem) => /secure context/.test(problem)));
} catch (error) {
  failures.push(String(error?.stack ?? error));
  console.error(`❌ probe failed: ${error?.stack ?? error}`);
} finally {
  await cleanup();
}

console.log(failures.length === 0 ? "\nPASS  both origins report their real worklet state" : `\nFAIL  ${failures.join(" · ")}`);
process.exit(failures.length === 0 ? 0 : 1);
