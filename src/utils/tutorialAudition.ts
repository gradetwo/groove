/**
 * Interactive Tutorial Audio Audition Engine
 *
 * Provides synthesized acoustic demonstrations for each of the
 * 8 interactive tutorial courses in HelpCenterModal:
 * - drum: 4-beat Euclidean rhythm demo with physical kick and rim
 * - piano: Rich Cmaj9 jazz voicing with acoustic piano modeling
 * - mixer: True-peak limited transient burst with reverb tail
 * - acoustics: Somatic physical kick with 45Hz sub-bass drop
 * - maker: Modular synth melodic arpeggio hook
 * - chords: Classic ii-V-I jazz cadence with pop ballad voicing
 * - masterclass: 3-against-4 polyrhythmic click pulse
 * - galaxy: Ethereal neo-soul ambient progression
 */

import { globalAnatomyKickEngine } from "../audio/AnatomyKickEngine";
import { ChordAudioEngine } from "../audio/ChordAudioEngine";
import { createEngineAudioContext } from "../audio/voiceRegistry";

let sharedChordEngine: ChordAudioEngine | null = null;
let activeStopFn: (() => void) | null = null;

export function stopTutorialAudition(): void {
  if (activeStopFn) {
    try {
      activeStopFn();
    } catch {
      // Non-fatal
    }
    activeStopFn = null;
  }
  if (sharedChordEngine) {
    try {
      sharedChordEngine.stop();
      sharedChordEngine.panic();
    } catch {
      // Non-fatal
    }
  }
}

export async function auditionTutorialSound(tutorialId: string): Promise<() => void> {
  stopTutorialAudition();

  if (!sharedChordEngine) {
    sharedChordEngine = new ChordAudioEngine();
  }
  await sharedChordEngine.resume();

  let isCancelled = false;
  const cancel = () => {
    isCancelled = true;
    stopTutorialAudition();
  };
  activeStopFn = cancel;

  switch (tutorialId) {
    case "acoustics": {
      // Direct somatic kick hit with sub-harmonic body
      globalAnatomyKickEngine.trigger(undefined, 0.95);
      break;
    }

    case "piano": {
      // Cmaj9 lush chord voicing on acoustic piano
      sharedChordEngine.triggerChord(
        { root: "C", quality: "maj9", duration: 4 },
        "piano",
        "block",
        2.5,
        0.9
      );
      break;
    }

    case "chords": {
      // ii - V - I jazz progression: Dm7 -> G7 -> Cmaj7
      sharedChordEngine.triggerChord(
        { root: "D", quality: "min7", duration: 2 },
        "piano",
        "ballad",
        1.2,
        0.85
      );
      const timer1 = setTimeout(() => {
        if (isCancelled) return;
        sharedChordEngine?.triggerChord(
          { root: "G", quality: "7", duration: 2 },
          "piano",
          "ballad",
          1.2,
          0.85
        );
      }, 900);
      const timer2 = setTimeout(() => {
        if (isCancelled) return;
        sharedChordEngine?.triggerChord(
          { root: "C", quality: "maj7", duration: 4 },
          "piano",
          "ballad",
          2.0,
          0.9
        );
      }, 1800);

      activeStopFn = () => {
        clearTimeout(timer1);
        clearTimeout(timer2);
        sharedChordEngine?.stop();
      };
      break;
    }

    case "drum": {
      // 4-step Euclidean groove: Kick on 0, 2; high clicks on 1, 3
      globalAnatomyKickEngine.trigger(undefined, 0.9);
      const ctx = createEngineAudioContext();
      if (ctx) {
        const playClick = (timeOffset: number, freq: number) => {
          try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "triangle";
            osc.frequency.setValueAtTime(freq, ctx.currentTime + timeOffset);
            gain.gain.setValueAtTime(0.3, ctx.currentTime + timeOffset);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + timeOffset + 0.08);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + timeOffset);
            osc.stop(ctx.currentTime + timeOffset + 0.1);
          } catch {
            // Ignore in environments without full Web Audio
          }
        };
        playClick(0.25, 800);
        const timerKick = setTimeout(() => {
          if (!isCancelled) globalAnatomyKickEngine.trigger(undefined, 0.75);
        }, 500);
        playClick(0.75, 1200);
        activeStopFn = () => {
          clearTimeout(timerKick);
          ctx.close().catch(() => {});
        };
      }
      break;
    }

    case "masterclass": {
      // 3:4 Polyrhythm Demonstration: High ping (4 beats) vs Warm knock (3 beats)
      const ctx = createEngineAudioContext();
      if (ctx) {
        const totalDur = 1.6;
        try {
          // 4 beats at high freq (880Hz)
          for (let i = 0; i < 4; i++) {
            const t = (totalDur / 4) * i;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.frequency.setValueAtTime(880, ctx.currentTime + t);
            gain.gain.setValueAtTime(0.25, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.06);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.08);
          }
          // 3 beats at low freq (330Hz)
          for (let j = 0; j < 3; j++) {
            const t = (totalDur / 3) * j;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(330, ctx.currentTime + t);
            gain.gain.setValueAtTime(0.2, ctx.currentTime + t);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.09);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(ctx.currentTime + t);
            osc.stop(ctx.currentTime + t + 0.1);
          }
        } catch {
          // Ignore in environments without full Web Audio
        }
        activeStopFn = () => {
          ctx.close().catch(() => {});
        };
      }
      break;
    }

    case "mixer": {
      // True-Peak acoustic burst: kick + bright chord strum
      globalAnatomyKickEngine.trigger(undefined, 0.9);
      sharedChordEngine.triggerChord(
        { root: "F", quality: "maj7", duration: 2 },
        "guitar",
        "strum",
        1.5,
        0.8
      );
      break;
    }

    case "maker": {
      // Melodic synthesizer hook: arpeggio run
      sharedChordEngine.triggerChord(
        { root: "A", quality: "min7", duration: 3 },
        "piano",
        "arpeggio",
        2.0,
        0.85
      );
      break;
    }

    case "galaxy":
    default: {
      // Ethereal neo-soul ambient progression
      sharedChordEngine.triggerChord(
        { root: "F", quality: "maj9", duration: 3 },
        "piano",
        "ballad",
        2.5,
        0.8
      );
      break;
    }
  }

  return cancel;
}
