/**
 * The in-app diagnostic report — the button that turns "Safari sounds wrong" into data.
 *
 * ## Why it exists
 *
 * Three reports about Safari have been chased from measurements taken in **Chromium on a workstation**: the export
 * silence and the tuning-order defect were both real and both landed, but the lead still crackles on the user's own
 * machine, and no amount of headless rendering reproduces *their* audio stack. The missing piece is not another probe
 * of ours; it is a way for the person hearing it to hand over what their browser is doing.
 *
 * `?diag=1` opens a small panel over the app with:
 *
 *   · the environment (engine, sample rate, context state) and the GS-1 routing state;
 *   · the **verdict** of both capability probes — the offline one, and a fresh live measurement of the master
 *     analyser taken while the transport plays;
 *   · a GS-1 on/off button, because "does the symptom survive with the synth engine switched off" is the single most
 *     informative question about a voice defect, and it should not require finding the audio-settings panel;
 *   · a **Copy report** button that puts one JSON blob on the clipboard.
 *
 * It is a development surface and it is gated exactly like the probe hook: it does nothing at all unless the URL asks
 * for it, and it is not in the way of anything else.
 */
import type { AudioEngine } from "../audio/AudioEngine";
import { ensureOfflineGs1Capability, gs1OfflineCapability } from "../audio/gs1/gs1OfflineCapability";

/** Whether this page asked for the diagnostic panel. */
export function diagRequested(search: string = typeof window === "undefined" ? "" : window.location.search): boolean {
  try {
    return new URLSearchParams(search).get("diag") === "1";
  } catch {
    return false;
  }
}

/**
 * Measure the master output for `ms` and return the peak and rms, plus the analyser's own setup.
 *
 * The numbers a defect report needs are almost always "is there output at all, and how loud" — a crackle that starts
 * after a second shows up as a peak that is either pinned or absent.
 */
export async function measureMaster(
  engine: AudioEngine,
  ms = 1200
): Promise<{ peak: number; rms: number; samples: number; sampleRate: number; fftSize: number } | null> {
  const analyser = engine.getMasterAnalyser();
  if (!analyser) return null;
  const frames = new Float32Array(analyser.fftSize);
  const started = Date.now();
  let peak = 0;
  let sum = 0;
  let count = 0;
  while (Date.now() - started < ms) {
    analyser.getFloatTimeDomainData(frames);
    for (let i = 0; i < frames.length; i += 1) {
      const value = Math.abs(frames[i]);
      if (value > peak) peak = value;
      sum += frames[i] * frames[i];
      count += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  return {
    peak: Number(peak.toExponential(3)),
    rms: Number(Math.sqrt(sum / Math.max(1, count)).toExponential(3)),
    samples: count,
    sampleRate: analyser.context.sampleRate,
    fftSize: analyser.fftSize,
  };
}

export interface DiagReport {
  at: string;
  userAgent: string;
  platform: string;
  hardwareConcurrency: number | null;
  sampleRate: number | null;
  contextState: string | null;
  gs1Enabled: boolean;
  gs1OfflineVerdict: string | null;
  gs1Hosts: Array<Record<string, unknown>>;
  playing: boolean;
  currentStep: number | null;
  master: Awaited<ReturnType<typeof measureMaster>>;
  notes: string[];
}

/** Everything the panel shows, in the shape that gets copied. Pure apart from the engine reads it is handed. */
export async function collectDiagReport(engine: AudioEngine, notes: string[] = []): Promise<DiagReport> {
  const ctx = (engine as unknown as { ctx?: AudioContext | null }).ctx ?? null;
  let gs1Hosts: Array<Record<string, unknown>> = [];
  try {
    gs1Hosts = engine.getGs1Diagnostics().hosts;
  } catch {
    /* an engine that cannot report is itself worth seeing, but not worth throwing over */
  }
  return {
    at: new Date().toISOString(),
    userAgent: typeof navigator === "undefined" ? "(no navigator)" : navigator.userAgent,
    platform: typeof navigator === "undefined" ? "?" : String((navigator as { platform?: string }).platform ?? "?"),
    hardwareConcurrency: typeof navigator === "undefined" ? null : (navigator.hardwareConcurrency ?? null),
    sampleRate: ctx?.sampleRate ?? null,
    contextState: ctx?.state ?? null,
    gs1Enabled: engine.isGs1Enabled(),
    gs1OfflineVerdict: gs1OfflineCapability() ?? null,
    gs1Hosts,
    playing: engine.getIsPlaying(),
    currentStep: engine.getCurrentStep(),
    master: await measureMaster(engine),
    notes,
  };
}

/**
 * The panel itself. Plain DOM on purpose: it is a diagnostic, it has to survive whatever the app's own views are
 * doing, and it must not need a route or a React tree.
 */
export function installDiagnostics(engine: AudioEngine): () => void {
  if (typeof document === "undefined") return () => undefined;
  const panel = document.createElement("div");
  panel.setAttribute("data-testid", "diag-panel");
  panel.style.cssText = [
    "position:fixed",
    "right:12px",
    "bottom:12px",
    "z-index:2147483647",
    "max-width:min(92vw, 460px)",
    "max-height:70vh",
    "overflow:auto",
    "background:#0b0b0f",
    "color:#e8e8ee",
    "font:12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
    "border:1px solid #3a3a44",
    "border-radius:10px",
    "padding:10px 12px",
    "white-space:pre-wrap",
    "box-shadow:0 8px 30px rgba(0,0,0,.45)",
  ].join(";");

  const out = document.createElement("div");
  out.textContent = "diag: collecting…";
  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin:8px 0";

  const button = (label: string, onClick: () => void) => {
    const b = document.createElement("button");
    b.textContent = label;
    b.style.cssText =
      "font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #4a4a58;background:#191922;color:#e8e8ee;cursor:pointer";
    b.addEventListener("click", onClick);
    buttons.appendChild(b);
    return b;
  };

  const notes: string[] = [];
  const refresh = async () => {
    out.textContent = "diag: measuring… (start playback for a live reading)";
    const report = await collectDiagReport(engine, [...notes]);
    out.textContent = [
      `UA      ${report.userAgent}`,
      `rate    ${report.sampleRate} · ctx ${report.contextState} · cores ${report.hardwareConcurrency}`,
      `GS-1    enabled=${report.gs1Enabled} · offline probe=${report.gs1OfflineVerdict ?? "not run"}`,
      `hosts   ${JSON.stringify(report.gs1Hosts)}`,
      `playing ${report.playing} · step ${report.currentStep}`,
      `master  ${report.master ? `peak ${report.master.peak} rms ${report.master.rms}` : "no analyser"}`,
      notes.length ? `notes   ${notes.join(" | ")}` : "",
      "",
      "按 Copy report 会把上面这份 JSON 复制到剪贴板（同时打印到控制台）。",
    ]
      .filter(Boolean)
      .join("\n");
    (panel as unknown as { __report?: DiagReport }).__report = report;
    // eslint-disable-next-line no-console
    console.log("[diag]", JSON.stringify(report));
  };

  button("Refresh", () => void refresh());
  button("Copy report", () => {
    const report = (panel as unknown as { __report?: DiagReport }).__report;
    const text = JSON.stringify(report ?? { error: "nothing measured yet" }, null, 2);
    void navigator.clipboard?.writeText(text).then(
      () => {
        notes.push("copied");
        out.textContent += "\n(copied to clipboard)";
      },
      () => {
        notes.push("clipboard refused");
        out.textContent += "\n(clipboard refused — the report is in the console)";
      }
    );
  });
  button("GS-1 on/off (listen)", () => {
    const next = !engine.isGs1Enabled();
    engine.setGs1Enabled(next);
    notes.push(`gs1=${next}`);
    // eslint-disable-next-line no-console
    console.log("[diag] GS-1", next ? "on" : "off");
    void refresh();
  });
  button("Run offline probe", () => {
    void ensureOfflineGs1Capability().then((verdict) => {
      notes.push(`offline probe=${verdict}`);
      void refresh();
    });
  });

  panel.appendChild(buttons);
  panel.appendChild(out);
  document.body.appendChild(panel);
  void refresh();

  return () => panel.remove();
}
