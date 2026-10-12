import React from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "../../i18n/LanguageContext";

/**
 * The signal-chain strip at the top of the effects page (item ①).
 *
 * Logic's channel strip shows one slot per processor, each with a power state, and clicking a slot
 * opens that processor. This does the same for the four stages the strip actually has — in the
 * order the DSP wires them (`ChannelStripDsp`: high-pass → low shelf → peaking → high shelf →
 * compressor → makeup → drive):
 *
 *   HP  →  EQ  →  Comp  →  Drive
 *
 * The strip is also where the redesign fixes the old information architecture: the EQ used to live
 * under the "mix" tab while the compressor lived under "effects", even though all of them are one
 * serial insert chain. Everything in the chain is now here, and the mixer tab keeps level, pan and
 * sends.
 */
export type InsertStageId = "hpf" | "eq" | "comp" | "drive";

export interface InsertFlowStage {
  id: InsertStageId;
  label: string;
  enabled: boolean;
  /** Short value readout, so the strip says what each stage is doing without opening it. */
  summary: string;
  onToggle: () => void;
}

export interface InsertFlowStripProps {
  stages: InsertFlowStage[];
  selected: InsertStageId;
  onSelect: (id: InsertStageId) => void;
}

export const InsertFlowStrip: React.FC<InsertFlowStripProps> = ({ stages, selected, onSelect }) => {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-line bg-panel2/60 p-2" data-testid="insert-flow-strip">
      <div className="flex items-center justify-between">
        <span className="font-['JetBrains_Mono'] text-[9px] uppercase tracking-[0.12em] text-text-dim">
          {t("insert_flow_title")}
        </span>
        <span className="text-[9px] text-text-dim">{t("insert_flow_hint")}</span>
      </div>
      <div className="mt-1.5 flex items-stretch gap-1">
        {stages.map((stage, index) => (
          <React.Fragment key={stage.id}>
            {index > 0 && <ArrowRight className="mt-3 h-3 w-3 shrink-0 text-text-dim" aria-hidden />}
            <div
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-1.5 py-1 transition-colors ${
                selected === stage.id ? "border-accent bg-accent/10" : "border-line bg-[#15171d]"
              }`}
            >
              {/* The power dot: toggling is independent of selecting, like a plugin slot. */}
              <button
                type="button"
                onClick={stage.onToggle}
                aria-pressed={stage.enabled}
                aria-label={`${stage.label} ${t("audio_settings_on")}/${t("audio_settings_off")}`}
                data-testid={`insert-flow-${stage.id}-toggle`}
                className={`h-2.5 w-2.5 shrink-0 rounded-full border transition-colors ${
                  stage.enabled ? "border-emerald-400 bg-emerald-400" : "border-line-strong bg-transparent"
                }`}
              />
              <button
                type="button"
                onClick={() => onSelect(stage.id)}
                aria-pressed={selected === stage.id}
                data-testid={`insert-flow-${stage.id}`}
                title={`${stage.label} · ${stage.summary}`}
                className="min-w-0 flex-1 text-left"
              >
                <div
                  className={`truncate font-['JetBrains_Mono'] text-[10px] font-bold uppercase tracking-[0.06em] ${
                    stage.enabled ? "text-text" : "text-text-dim line-through"
                  }`}
                >
                  {stage.label}
                </div>
                <div className="truncate font-['JetBrains_Mono'] text-[9px] text-text-dim">{stage.summary}</div>
              </button>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
};
