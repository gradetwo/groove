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
import { captureMasterAudio } from "./audioCapture";
import { triggerWavDownload } from "../audio/WavExporter";


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
  /** `AudioContext.baseLatency` / `outputLatency`, in ms — what the device adds before the listener hears it. */
  baseLatencyMs: number | null;
  outputLatencyMs: number | null;
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
    baseLatencyMs:
      ctx && Number.isFinite((ctx as AudioContext).baseLatency) ? Math.round((ctx as AudioContext).baseLatency * 1000) : null,
    outputLatencyMs:
      ctx && Number.isFinite((ctx as { outputLatency?: number }).outputLatency)
        ? Math.round(((ctx as { outputLatency?: number }).outputLatency ?? 0) * 1000)
        : null,
    gs1OfflineVerdict: gs1OfflineCapability() ?? null,
    gs1Hosts,
    playing: engine.getIsPlaying(),
    currentStep: engine.getCurrentStep(),
    master: await measureMaster(engine),
    notes,
  };
}

/**
 * The panel: draggable, collapsible to a pill, and small on purpose.
 *
 * The first version was a fixed block in the bottom-right corner with no way to put it away, and on a phone that is
 * the same as no panel at all — the report is off-screen and the app underneath is unusable. This one has a header
 * you can **drag**, a **收起/展开** control that leaves a small pill behind, and a **关闭** button; expanded it takes
 * a modest slice of the screen rather than all of it, and the live strip beside the environment is the part that
 * matters for a defect that *starts*: peak, rms, clipped samples and the worklet's own voice count and load, updated
 * once a second.
 */
export function installDiagnostics(engine: AudioEngine): () => void {
  if (typeof document === "undefined") return () => undefined;

  const pill = document.createElement("button");
  pill.type = "button";
  pill.setAttribute("data-testid", "diag-pill");
  pill.textContent = "diag";
  pill.style.cssText = [
    "position:fixed",
    "right:10px",
    "bottom:calc(10px + env(safe-area-inset-bottom, 0px))",
    "z-index:2147483647",
    "font:600 11px/1 ui-monospace, SFMono-Regular, Menlo, monospace",
    "letter-spacing:.06em",
    "padding:8px 10px",
    "border-radius:999px",
    "border:1px solid #3a3a44",
    "background:#0b0b0f",
    "color:#e8e8ee",
    "min-height:32px",
    "cursor:pointer",
  ].join(";");

  const panel = document.createElement("div");
  panel.setAttribute("data-testid", "diag-panel");
  panel.style.cssText = [
    "position:fixed",
    "right:10px",
    "bottom:calc(10px + env(safe-area-inset-bottom, 0px))",
    "z-index:2147483647",
    "width:min(92vw, 380px)",
    "max-height:52vh",
    "display:flex",
    "flex-direction:column",
    "background:#0b0b0f",
    "color:#e8e8ee",
    "font:11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace",
    "border:1px solid #3a3a44",
    "border-radius:10px",
    "box-shadow:0 8px 30px rgba(0,0,0,.5)",
    "overflow:hidden",
  ].join(";");

  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:6px;padding:6px 8px;background:#14141b;cursor:move;touch-action:none;user-select:none";
  const title = document.createElement("span");
  title.textContent = "diag";
  title.style.cssText = "flex:1;letter-spacing:.08em;text-transform:uppercase;opacity:.75";
  header.appendChild(title);

  const small = (label: string, onClick: () => void, testid?: string) => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    if (testid) b.setAttribute("data-testid", testid);
    b.style.cssText =
      "font:inherit;padding:4px 7px;border-radius:6px;border:1px solid #4a4a58;background:#191922;color:#e8e8ee;cursor:pointer;min-height:28px";
    b.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick();
    });
    return b;
  };

  const body = document.createElement("div");
  body.style.cssText = "overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px";

  const live = document.createElement("div");
  live.style.cssText = "display:grid;grid-template-columns:auto 1fr;gap:2px 8px";
  const out = document.createElement("div");
  out.style.cssText = "white-space:pre-wrap;opacity:.85";

  const buttons = document.createElement("div");
  buttons.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";

  // ---- collapse / expand -------------------------------------------------------
  let collapsed = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const applyCollapsed = () => {
    panel.style.display = collapsed ? "none" : "flex";
    pill.style.display = collapsed ? "block" : "none";
  };
  pill.addEventListener("click", () => {
    collapsed = false;
    applyCollapsed();
  });
  header.appendChild(small("收起", () => {
    collapsed = true;
    applyCollapsed();
  }, "diag-collapse"));
  header.appendChild(small("关闭", () => {
    if (timer) clearInterval(timer);
    panel.remove();
    pill.remove();
  }, "diag-close"));
  panel.appendChild(header);
  panel.appendChild(body);
  body.appendChild(live);
  body.appendChild(buttons);
  body.appendChild(out);

  // ---- drag by the header ------------------------------------------------------
  let drag: { x: number; y: number; left: number; top: number } | null = null;
  const place = (left: number, top: number) => {
    for (const node of [panel, pill]) {
      node.style.left = `${Math.max(0, Math.min(window.innerWidth - 60, left))}px`;
      node.style.top = `${Math.max(0, Math.min(window.innerHeight - 40, top))}px`;
      node.style.right = "auto";
      node.style.bottom = "auto";
    }
  };
  header.addEventListener("pointerdown", (event) => {
    const rect = panel.getBoundingClientRect();
    drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener("pointermove", (event) => {
    if (!drag) return;
    place(drag.left + (event.clientX - drag.x), drag.top + (event.clientY - drag.y));
  });
  header.addEventListener("pointerup", () => {
    drag = null;
  });

  // ---- the numbers -------------------------------------------------------------
  const notes: string[] = [];
  const render = async () => {
    const report = await collectDiagReport(engine, [...notes]);
    const host = report.gs1Hosts.find((h) => h.analysis) ?? report.gs1Hosts[0] ?? null;
    const analysis = (host?.analysis ?? null) as Record<string, number> | null;
    const rows: Array<[string, string]> = [
      ["master", report.master ? `peak ${report.master.peak} · rms ${report.master.rms}` : "no analyser"],
      ["clipped", report.master ? String(report.master.samples) : "-"],
      ["voices", analysis ? String(analysis.voices) : "-"],
      ["load", analysis ? String(analysis.load) : "-"],
      ["violations", analysis ? String(analysis.violations) : "-"],
      ["hosts", String(report.gs1Hosts.length)],
      ["step", `${report.playing ? "playing" : "stopped"} · ${report.currentStep}`],
      /**
       * The browser's own latency, which is the half of "the sound is late" that no code of ours can fix: Safari on a
       * Bluetooth output reports hundreds of milliseconds here, and the visual playhead compensates for exactly this
       * number (`visualLeadSeconds`).
       */
      ["latency", `${report.baseLatencyMs} ms base · ${report.outputLatencyMs} ms out`],
    ];
    live.textContent = "";
    for (const [key, value] of rows) {
      const k = document.createElement("span");
      k.textContent = key;
      k.style.opacity = "0.6";
      const v = document.createElement("span");
      v.textContent = value;
      live.appendChild(k);
      live.appendChild(v);
    }
    out.textContent = [
      `rate   ${report.sampleRate} · ctx ${report.contextState}`,
      `GS-1   ${report.gs1Enabled ? "on" : "off"} · offline probe ${report.gs1OfflineVerdict ?? "not run"}`,
      `hosts  ${report.gs1Hosts.map((h) => `${h.role}:${h.patch ?? "-"}${h.ready ? "" : "!"}`).join(" ")}`,
      notes.length ? `notes  ${notes.join(" | ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    (panel as unknown as { __report?: DiagReport }).__report = report;
  };

  buttons.appendChild(small("刷新", () => void render(), "diag-refresh"));
  buttons.appendChild(
    small(
      "GS-1 开关",
      () => {
        engine.setGs1Enabled(!engine.isGs1Enabled());
        notes.push(`gs1=${engine.isGs1Enabled()}`);
      },
      "diag-gs1"
    )
  );
  /**
   * **录制** — the one button that needs a person rather than a metric.
   *
   * Six rounds of detectors disagreed with the listener about a pop after every note (see the upstream plan's §1g),
   * because they measured a stem render. This records the **live master output** — the signal the ears are actually on —
   * and downloads it, so the next step is reading the file the owner heard rather than building a sixth detector.
   */
  buttons.appendChild(
    small(
      "录制 10 秒",
      () => {
        notes.push("recording…");
        void render();
        void captureMasterAudio(10).then(
          (result) => {
            triggerWavDownload(result.blob, result.filename);
            notes.push(`saved ${result.filename} (${result.seconds.toFixed(1)}s, ${Math.round(result.blob.size / 1024)} KB)`);
            void render();
          },
          (error: unknown) => {
            notes.push(`record failed: ${error instanceof Error ? error.message : String(error)}`);
            void render();
          }
        );
      },
      "diag-record"
    )
  );
  buttons.appendChild(
    small(
      "复制报告",
      () => {
        const report = (panel as unknown as { __report?: DiagReport }).__report;
        const text = JSON.stringify(report ?? { error: "nothing measured yet" }, null, 2);
        // eslint-disable-next-line no-console
        console.log("[diag]", text);
        void navigator.clipboard?.writeText(text).then(
          () => notes.push("copied"),
          () => notes.push("clipboard refused")
        );
      },
      "diag-copy"
    )
  );

  document.body.appendChild(panel);
  document.body.appendChild(pill);
  applyCollapsed();
  void render();
  timer = setInterval(() => void render(), 2000);

  return () => {
    if (timer) clearInterval(timer);
    panel.remove();
    pill.remove();
  };
}
