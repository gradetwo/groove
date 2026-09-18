import { useEffect, useRef, useState } from "react";
import { SequencerPattern } from "../../../types/genre";
import { AudioEngine } from "../../../audio/AudioEngine";
import { clonePattern } from "../useSequencerStore";
import type { SequencerAction } from "../useSequencerStore";
import { triggerHaptic, HapticPatterns } from "../../../utils/haptics";
import type { PitchPickerState, StepContextMenuState } from "./useTransportShortcuts";

export interface UseGridInteractionOptions {
  pattern: SequencerPattern;
  patternRef: React.MutableRefObject<SequencerPattern>;
  commit: (action: SequencerAction, recordHistory?: boolean) => void;
  engineRef: React.MutableRefObject<AudioEngine | null>;
  mobileEditMode: "step" | "accent" | "ratchet" | "pitch" | "plocks";
  setStepContextMenu: React.Dispatch<React.SetStateAction<StepContextMenuState | null>>;
  setPitchPicker: React.Dispatch<React.SetStateAction<PitchPickerState>>;
}

export interface UseGridInteractionResult {
  /** Coarse pointer / touch device detection (drives the mobile hint copy). */
  isTouchDevice: boolean;
  handleGridPointerDown: (e: React.PointerEvent) => void;
  handleGridPointerMove: (e: React.PointerEvent) => void;
  handleGridPointerUp: (e: React.PointerEvent) => void;
  handleGridContextMenu: (e: React.MouseEvent) => void;
  handleMobileStepAction: (trackIdx: number, stepIdx: number) => void;
}

/**
 * A-02: the delegated step-grid input layer — mouse drag-to-paint batching
 * (P2-02/P2-05), long-press P-Locks on touch, right-click context menu, the
 * mobile tool-mode tap actions, and touch-device detection. Extracted verbatim
 * from `StudioView`, which also owned the drag/long-press refs and their cleanup.
 */
export function useGridInteraction({
  pattern,
  patternRef,
  commit,
  engineRef,
  mobileEditMode,
  setStepContextMenu,
  setPitchPicker,
}: UseGridInteractionOptions): UseGridInteractionResult {
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  // Pointer drag painting & event delegation refs (P2-02 & P2-05)
  const isPointerDownRef = useRef(false);
  const dragValRef = useRef<number | null>(null);
  const pendingPaintMapRef = useRef<
    Map<string, { trackIdx: number; stepIdx: number; val: number }>
  >(new Map());
  const longPressTimerRef = useRef<any>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const checkTouch = () => {
      const hasTouch =
        typeof window !== "undefined" &&
        ("ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          (window.matchMedia && window.matchMedia("(pointer: coarse)").matches));
      setIsTouchDevice(hasTouch);
    };
    checkTouch();
  }, []);

  // Clean up a pending long-press timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, []);

  // Event Delegation & Drag-to-paint batching (P2-02 & P2-05)
  const handleGridPointerDown = (e: React.PointerEvent) => {
    const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
    if (!target) return;

    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx < 0 || stepIdx < 0) return;

    const tr = pattern.tracks[trackIdx];
    if (!tr) return;

    if (e.pointerType === "touch") {
      isLongPressRef.current = false;
      touchStartPosRef.current = { x: e.clientX, y: e.clientY };
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

      longPressTimerRef.current = setTimeout(() => {
        isLongPressRef.current = true;
        triggerHaptic(HapticPatterns.doubleTap);
        setStepContextMenu({
          isOpen: true,
          x: e.clientX,
          y: e.clientY,
          trackIdx,
          stepIdx,
        });
      }, 450);
      return;
    }

    // Desktop Mouse Drag-Paint
    isPointerDownRef.current = true;
    pendingPaintMapRef.current.clear();
    const curVal = tr.steps[stepIdx] || 0;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const nextVal = isHat
      ? curVal === 0
        ? 1
        : curVal === 1
          ? 2
          : curVal === 2
            ? 3
            : 0
      : curVal > 0
        ? 0
        : 1;

    dragValRef.current = nextVal;
    pendingPaintMapRef.current.set(`${trackIdx}:${stepIdx}`, { trackIdx, stepIdx, val: nextVal });

    // Audition sound
    if (nextVal > 0 && engineRef.current) {
      const activeIdx = tr.trackLength && tr.trackLength > 0 ? stepIdx % tr.trackLength : stepIdx;
      const pitch = tr.pitch && tr.pitch[activeIdx] ? tr.pitch[activeIdx] : 0;
      const vel = (tr.velocity && tr.velocity[activeIdx] ? tr.velocity[activeIdx] : 100) / 127;
      const gate = tr.gate && tr.gate[activeIdx] ? tr.gate[activeIdx] : 0.8;
      engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal, gate, activeIdx);
    }
  };

  const handleGridPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === "touch" && touchStartPosRef.current) {
      const dist = Math.hypot(
        e.clientX - touchStartPosRef.current.x,
        e.clientY - touchStartPosRef.current.y
      );
      if (dist > 8 && longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      return;
    }

    if (!isPointerDownRef.current || dragValRef.current === null) return;

    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest("[data-track-idx][data-step-idx]");
    if (!target) return;

    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx < 0 || stepIdx < 0) return;

    const key = `${trackIdx}:${stepIdx}`;
    if (!pendingPaintMapRef.current.has(key)) {
      const val = dragValRef.current;
      pendingPaintMapRef.current.set(key, { trackIdx, stepIdx, val });
      const tr = pattern.tracks[trackIdx];
      if (tr && val > 0 && engineRef.current) {
        const activeIdx = tr.trackLength && tr.trackLength > 0 ? stepIdx % tr.trackLength : stepIdx;
        const pitch = tr.pitch && tr.pitch[activeIdx] ? tr.pitch[activeIdx] : 0;
        const vel = (tr.velocity && tr.velocity[activeIdx] ? tr.velocity[activeIdx] : 100) / 127;
        const gate = tr.gate && tr.gate[activeIdx] ? tr.gate[activeIdx] : 0.8;
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, val, gate, activeIdx);
      }
    }
  };

  const handleGridPointerUp = (e: React.PointerEvent) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }

    if (e.pointerType === "touch") {
      if (!isLongPressRef.current) {
        const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
        if (target) {
          const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
          const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
          if (trackIdx >= 0 && stepIdx >= 0) {
            handleMobileStepAction(trackIdx, stepIdx);
          }
        }
      }
      isLongPressRef.current = false;
      return;
    }

    // Flush batch paint changes once (P2-05)
    if (isPointerDownRef.current && pendingPaintMapRef.current.size > 0) {
      const nextPattern = clonePattern(patternRef.current);
      pendingPaintMapRef.current.forEach(({ trackIdx, stepIdx, val }) => {
        const t = nextPattern.tracks[trackIdx];
        if (t) {
          const trackLen = t.trackLength && t.trackLength > 0 && t.trackLength < t.steps.length ? t.trackLength : null;
          if (trackLen) {
            const baseIdx = stepIdx % trackLen;
            for (let i = baseIdx; i < t.steps.length; i += trackLen) {
              t.steps[i] = val;
              if (val > 0 && (!t.velocity || !t.velocity[i])) {
                if (!t.velocity) t.velocity = Array(t.steps.length).fill(100);
                t.velocity[i] = 100;
              }
              if (val > 0 && t.track_id === "chords") {
                const prefGate = t.gate?.find((g, idx) => (t.steps[idx] ?? 0) > 0 && g >= 2) ?? 16;
                if (!t.gate) t.gate = Array(t.steps.length).fill(0.8);
                if (t.gate[i] === undefined || t.gate[i] <= 1) {
                  t.gate[i] = prefGate;
                }
              }
            }
          } else {
            t.steps[stepIdx] = val;
            if (val > 0 && (!t.velocity || !t.velocity[stepIdx])) {
              if (!t.velocity) t.velocity = Array(t.steps.length).fill(100);
              t.velocity[stepIdx] = 100;
            }
            if (val > 0 && t.track_id === "chords") {
              const prefGate = t.gate?.find((g, idx) => (t.steps[idx] ?? 0) > 0 && g >= 2) ?? 16;
              if (!t.gate) t.gate = Array(t.steps.length).fill(0.8);
              if (t.gate[stepIdx] === undefined || t.gate[stepIdx] <= 1) {
                t.gate[stepIdx] = prefGate;
              }
            }
          }
        }
      });
      commit({ type: "COMMIT_PATTERN", pattern: nextPattern });
      if (engineRef.current) {
        engineRef.current.setPattern(nextPattern);
      }
    }

    isPointerDownRef.current = false;
    dragValRef.current = null;
    pendingPaintMapRef.current.clear();
  };

  const handleGridContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const target = (e.target as HTMLElement).closest("[data-track-idx][data-step-idx]");
    if (!target) return;
    const trackIdx = parseInt(target.getAttribute("data-track-idx") || "-1", 10);
    const stepIdx = parseInt(target.getAttribute("data-step-idx") || "-1", 10);
    if (trackIdx >= 0 && stepIdx >= 0) {
      setStepContextMenu({
        isOpen: true,
        x: e.clientX,
        y: e.clientY,
        trackIdx,
        stepIdx,
      });
    }
  };

  const handleMobileStepAction = (trackIdx: number, stepIdx: number) => {
    const tr = pattern.tracks[trackIdx];
    if (!tr) return;
    const isHat = tr.track_id === "hihat" || tr.name.toLowerCase().includes("hat");
    const curVal = tr.steps[stepIdx] || 0;

    if (mobileEditMode === "step") {
      const nextVal = isHat
        ? curVal === 0
          ? 1
          : curVal === 1
            ? 2
            : curVal === 2
              ? 3
              : 0
        : curVal > 0
          ? 0
          : 1;
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: nextVal });
      if (nextVal > 0 && tr.track_id === "chords") {
        const prefGate = tr.gate?.find((g, i) => (tr.steps[i] ?? 0) > 0 && g >= 2) ?? 16;
        if (!tr.gate?.[stepIdx] || tr.gate[stepIdx] <= 1) {
          commit({ type: "SET_GATE", trackIdx, stepIdx, gate: prefGate });
        }
      }
      if (nextVal > 0 && engineRef.current) {
        const activeIdx = tr.trackLength && tr.trackLength > 0 ? stepIdx % tr.trackLength : stepIdx;
        const pitch = tr.pitch && tr.pitch[activeIdx] ? tr.pitch[activeIdx] : 0;
        const vel = (tr.velocity && tr.velocity[activeIdx] ? tr.velocity[activeIdx] : 100) / 127;
        const gate = (tr.gate && tr.gate[activeIdx] && tr.gate[activeIdx] > 1)
          ? tr.gate[activeIdx]
          : (tr.track_id === "chords" ? (tr.gate?.find((g, idx) => (tr.steps[idx] ?? 0) > 0 && g >= 2) ?? 16) : 0.8);
        engineRef.current.triggerNote(trackIdx, tr.name, vel, pitch, nextVal, gate, activeIdx);
      }
    } else if (mobileEditMode === "accent") {
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: 1 });
      commit({ type: "SET_VELOCITY", trackIdx, stepIdx, velocity: 127 });
      triggerHaptic(HapticPatterns.accent);
    } else if (mobileEditMode === "ratchet") {
      const curRatchet = tr.ratchet?.[stepIdx] || 1;
      const nextRatchet = curRatchet >= 4 ? 1 : curRatchet + 1;
      commit({ type: "SET_STEP", trackIdx, stepIdx, value: 1 });
      commit({ type: "SET_RATCHET", trackIdx, stepIdx, ratchet: nextRatchet });
    } else if (mobileEditMode === "pitch") {
      setPitchPicker({
        isOpen: true,
        trackIdx,
        stepIdx,
        initialNote: tr.pitch?.[stepIdx] ?? 60,
      });
    } else if (mobileEditMode === "plocks") {
      setStepContextMenu({
        isOpen: true,
        x: window.innerWidth / 2 - 120,
        y: window.innerHeight / 2 - 140,
        trackIdx,
        stepIdx,
      });
    }
  };

  return {
    isTouchDevice,
    handleGridPointerDown,
    handleGridPointerMove,
    handleGridPointerUp,
    handleGridContextMenu,
    handleMobileStepAction,
  };
}
