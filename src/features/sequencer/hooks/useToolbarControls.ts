import { useCallback } from "react";
import { DrumKitType, EffectsRackState } from "../../../audio/AudioEngine";
import type { SequencerAction } from "../useSequencerStore";

export interface UseToolbarControlsOptions {
  setDrumKit: React.Dispatch<React.SetStateAction<DrumKitType>>;
  setEffectsRackState: React.Dispatch<React.SetStateAction<EffectsRackState>>;
  isRecordArmed: boolean;
  setIsRecordArmed: React.Dispatch<React.SetStateAction<boolean>>;
  isKeyboardMode: boolean;
  setIsKeyboardMode: React.Dispatch<React.SetStateAction<boolean>>;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  commitCoalesced: (action: SequencerAction, key: string) => void;
  stepCount: number;
  groupSize: number;
  isZh: boolean;
  showToast: (msg: string) => void;
}

export interface UseToolbarControlsResult {
  handleChangeDrumKit: (k: DrumKitType) => void;
  handleToggleRecordArmed: () => void;
  handleChangeEffectsRack: (partial: Partial<EffectsRackState>) => void;
  handleChangeBpm: (b: number) => void;
  handleChangeSwing: (s: number) => void;
  handleChangeTimeSignature: (sig: string) => void;
  handleChangeResolution: (res: "1/8" | "1/16" | "1/32") => void;
  handleChangeStepCount: (count: number) => void;
  handleAddSteps: (count: number) => void;
  handleRemoveSteps: (count: number) => void;
  handleToggleKeyboardMode: () => void;
}

/**
 * A-02: the low-frequency Toolbar controls — drum kit, record-arm, master FX
 * rack, meter/BPM/swing/length parameters and keyboard-performance mode.
 *
 * A-03: `Toolbar` is memoized, so every prop it receives needs a stable
 * identity. These callbacks only depend on stable setters / store dispatchers
 * (plus the values that genuinely change), so a transport tick cannot invalidate
 * the Toolbar memo through them.
 */
export function useToolbarControls({
  setDrumKit,
  setEffectsRackState,
  isRecordArmed,
  setIsRecordArmed,
  isKeyboardMode,
  setIsKeyboardMode,
  commit,
  commitCoalesced,
  stepCount,
  groupSize,
  isZh,
  showToast,
}: UseToolbarControlsOptions): UseToolbarControlsResult {
  const handleChangeDrumKit = useCallback(
    (k: DrumKitType) => {
      setDrumKit(k);
      showToast(
        isZh ? `已切换硬件鼓机: ${k.toUpperCase()}` : `Switched drum kit: ${k.toUpperCase()}`
      );
    },
    [isZh, showToast]
  );

  const handleToggleRecordArmed = useCallback(() => {
    const next = !isRecordArmed;
    setIsRecordArmed(next);
    showToast(
      isZh
        ? next
          ? "🔴 实时录制已就绪 (点击打击垫或键盘即时写入网格)"
          : "实时录制已关闭"
        : next
          ? "🔴 Live recording armed"
          : "Live recording disarmed"
    );
  }, [isRecordArmed, isZh, showToast]);

  /**
   * D-03: FX edits go through the store, so they land in the undo stack. `StudioView`
   * keeps a local mirror for the UI and commits the merged rack here; coalescing means a
   * slider drag is one history entry, not one per frame.
   */
  const handleChangeEffectsRack = useCallback(
    (partial: Partial<EffectsRackState>) => {
      setEffectsRackState((prev) => ({ ...prev, ...partial }));
    },
    [setEffectsRackState]
  );

  const handleChangeBpm = useCallback(
    (b: number) => commitCoalesced({ type: "SET_BPM", bpm: b }, "bpm"),
    [commitCoalesced]
  );

  const handleChangeSwing = useCallback(
    (s: number) => commitCoalesced({ type: "SET_SWING", swing: s }, "swing"),
    [commitCoalesced]
  );

  const handleChangeTimeSignature = useCallback(
    (sig: string) => commit({ type: "SET_TIME_SIGNATURE", timeSignature: sig }),
    [commit]
  );

  const handleChangeResolution = useCallback(
    (res: "1/8" | "1/16" | "1/32") => commit({ type: "SET_RESOLUTION", resolution: res }),
    [commit]
  );

  const handleChangeStepCount = useCallback(
    (count: number) => commit({ type: "SET_STEP_COUNT", count }),
    [commit]
  );

  const handleAddSteps = useCallback(
    (count: number) => commit({ type: "SET_STEP_COUNT", count: stepCount + count }),
    [commit, stepCount]
  );

  const handleRemoveSteps = useCallback(
    (count: number) =>
      commit({ type: "SET_STEP_COUNT", count: Math.max(groupSize, stepCount - count) }),
    [commit, groupSize, stepCount]
  );

  const handleToggleKeyboardMode = useCallback(() => {
    const next = !isKeyboardMode;
    setIsKeyboardMode(next);
    showToast(
      isZh
        ? next
          ? "🎹 键盘演奏模式已启用 (按 1-8 触发轨道，Z-M 弹奏音符)"
          : "键盘演奏模式已关闭"
        : next
          ? "🎹 Keyboard play enabled (1-8 trigger tracks, Z-M play notes)"
          : "Keyboard play disabled"
    );
  }, [isKeyboardMode, isZh, showToast]);

  return {
    handleChangeDrumKit,
    handleToggleRecordArmed,
    handleChangeEffectsRack,
    handleChangeBpm,
    handleChangeSwing,
    handleChangeTimeSignature,
    handleChangeResolution,
    handleChangeStepCount,
    handleAddSteps,
    handleRemoveSteps,
    handleToggleKeyboardMode,
  };
}
