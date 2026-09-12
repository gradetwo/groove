import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronUp, Brain, Orbit, Activity, Shield, Sparkles } from "lucide-react";

interface KickPhilosophyDossierProps {
  isZh: boolean;
  className?: string;
}

export const KickPhilosophyDossier: React.FC<KickPhilosophyDossierProps> = ({
  isZh,
  className = "",
}) => {
  const [openSection, setOpenSection] = useState<number | null>(0);

  const toggleSection = (idx: number) => {
    setOpenSection((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className={`bg-[#050609] border border-line/60 rounded-lg p-5 font-mono select-none text-text-sub shadow-2xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-line/40">
        <div className="flex items-center gap-2.5">
          <BookOpen className="w-4 h-4 text-[#f5b73d]" />
          <div>
            <h3 className="text-sm font-bold text-text uppercase tracking-wider">
              {isZh ? "声学哲学、神经科学与底鼓本体论档案" : "THE ONTOLOGY OF THE KICK // DOSSIER"}
            </h3>
            <p className="text-[10px] text-text-dim">
              BAHADIRHAN KOÇER · DUB TECHNO: THE ORPHIC EXPERIENCE OF SOUND · PHENOMENOLOGY
            </p>
          </div>
        </div>
        <span className="text-[10px] px-2 py-0.5 rounded bg-[#10141e] text-[#f5b73d] border border-[#f5b73d]/30">
          ACADEMIC ARCHIVE
        </span>
      </div>

      {/* Chapters Accordion */}
      <div className="divide-y divide-line/30 mt-2">
        {/* Chapter 0: The Bodily Contract */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(0)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">00</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {isZh ? "契约与时间结晶：律动即身体妥协" : "THE BODILY CONTRACT // GROOVE AS COMPROMISE"}
              </span>
            </div>
            {openSection === 0 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 0 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 text-text-sub pl-6 border-l border-[#f5b73d]/40">
              <p className="italic text-text font-serif">
                {isZh
                  ? "“什么是律动？是一份契约，是我们心智与声音之间达成的一份时间流动契约。” —— Bahadırhan Koçer"
                  : "“What is groove? A pact, a time agreement between our minds and sound.” — Bahadırhan Koçer"}
              </p>
              <p>
                {isZh
                  ? "脉冲定义时间。没有节奏脉冲，时间就会像无定形的水一样散开、流失；一旦加入脉冲，时间便被定格、弯曲，并被赋予了方向。底鼓不是简单的低音打击乐器，而是整个电子音乐建筑的时间锚点（Chronological Anchor）。"
                  : "Pulse defines time. Without a rhythmic pulse, time diffuses like formless water; once the pulse strikes, time crystallizes, bends, and acquires directional momentum. The kick is not merely a percussion element, but the chronological anchor of modern acoustic architecture."}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 1: The Somatic Triad */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(1)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">01</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {isZh ? "三层身体解剖学：Sub、Thump 与神经锁相（PLV）" : "THE SOMATIC TRIAD // VISCERA, MASS & NEURAL PLV"}
              </span>
            </div>
            {openSection === 1 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 1 && (
            <div className="mt-3 text-xs leading-relaxed space-y-3 pl-6 border-l border-[#f5b73d]/40">
              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-[#f5b73d] font-bold">1. Sub (超低频 30–60 Hz) — 躯体与内脏 (Viscera / Gravity)</span>
                <p className="mt-1">
                  {isZh
                    ? "在次低频段，耳蜗基底膜几乎停止常规震动，听觉神经让位于皮肤与内脏的机械感受器（Mechanoreceptors）。它在人类意识判定‘这是音乐’之前就已经激活了躯体，是重力与生理的终极地基。"
                    : "At sub-bass frequencies, the cochlear basilar membrane ceases normal auditory vibration, yielding perception to mechanoreceptors across the skin and visceral organs. It activates the biological organism before conscious cognition recognizes 'music'—pure gravity and somatic weight."}
                </p>
              </div>

              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-white font-bold">2. Thump (击打感 100–200 Hz) — 肌肉与质量 (Muscular / Impact)</span>
                <p className="mt-1">
                  {isZh
                    ? "耳朵与身体相遇的中介频段。通过微秒级的非线性饱和（Saturation）与三角波形，赋予声音‘质量与密度（Mass）’的物理错觉，带来胸腔冲击感与撞击动量。"
                    : "The physical mediator where ear meets torso. Through microsecond non-linear saturation and triangular wave curvature, it bestows the psychoacoustic illusion of mass and density, delivering kinetic chest thump."}
                </p>
              </div>

              <div className="p-2.5 rounded bg-black/40 border border-line/40">
                <span className="text-[#f5b73d] font-bold">3. Click (高频瞬态 1–2.5 kHz) — 神经元与锁相 (Neural / PLV)</span>
                <p className="mt-1">
                  {isZh
                    ? "持续仅数毫秒的极短尖刺，触发听觉脑干反应（Auditory Brainstem Response, ABR），使大脑皮层神经元产生锁相（Phase-Locking Value, PLV）。没有它，声音只是一团浑浊的低频泥浆；有了它，神经系统才能在时间轴上实现毫秒级绝对对齐。"
                    : "A transient micro-spike lasting mere milliseconds. It elicits the Auditory Brainstem Response (ABR) and drives cortical neurons into Phase-Locking (PLV). Without it, sound is an unintelligible sonic blur; with it, the neural clock locks to the exact millisecond of the beat."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Chapter 2: The Ontological Evolution */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(2)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">02</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {isZh ? "本体论变迁：从 19 世纪军乐仪式到硅基单子" : "ONTOLOGICAL EVOLUTION // MARCHING RITUAL TO SILICON"}
              </span>
            </div>
            {openSection === 2 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 2 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 pl-6 border-l border-[#f5b73d]/40">
              <p>
                {isZh
                  ? "从 19 世纪军乐队大军鼓（Bass Drum）的物理敲击，到 20 世纪爵士乐踏板（Bass Drum Pedal）的人体工学结合，再到 TR-808/909 模拟电路的电荷震荡，底鼓经历了一次深刻的本体论跃迁。"
                  : "From the physical percussion of 19th-century marching drums, to the ergonomic pedal in jazz, to the analog Bridged-T oscillation of the TR-808/909, the kick drum underwent a profound ontological migration."}
              </p>
              <p>
                {isZh
                  ? "原初的集体仪式感在数字时代被消解，转而由卧室中孤独的制作人通过硅基芯片与参数算法进行微观操纵。然而，即使置身于虚拟电路之中，底鼓依然承载着将孤独个体重新编织进集体共振场（Resonance Field）的超验力量。"
                  : "The primal collective ritual was decomposed in the digital era, replaced by the solitary producer manipulating silicon chips and DSP algorithms in isolation. Yet even within virtual circuits, the kick retains the transcendental power to re-weave isolated individuals into a collective resonance field."}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 3: Resisting the McPulse & The Orphic Experience */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(3)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">03</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {isZh ? "抵抗“麦克脉冲”与奥菲斯内向建筑（鲍德里亚与麦克卢汉）" : "RESISTING THE MCPULSE // BAUDRILLARD & ORPHIC SPACE"}
              </span>
            </div>
            {openSection === 3 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 3 && (
            <div className="mt-3 text-xs leading-relaxed space-y-2 pl-6 border-l border-[#f5b73d]/40">
              <p className="italic text-text font-serif">
                {isZh
                  ? "“商业采样包是工业预制菜……拟像的复制品早已忘记了自己是否曾经是对真实的摹仿。” —— 鲍德里亚《拟像与仿真》视角"
                  : "“Pre-packaged kick samples are industrial fast food… The copy has long forgotten if it was ever an imitation.” — Baudrillard's Simulacra perspective"}
              </p>
              <p>
                {isZh
                  ? "现代商业制作充斥着高度抛光、过度压缩的‘麦克脉冲（McPulse）’。这种快餐式采样抹杀了声音的摩擦力（Friction）与阶级张力（Timbre carries class）。坚持原生合成（Synthesis from scratch）就是对这种均质化消费主义的抵抗。"
                  : "Modern commercial production is flooded with hyper-polished, over-compressed 'McPulses'. Such fast-food samples eradicate acoustic friction and class tension ('Timbre carries class'). Designing sound from scratch is a deliberate act of revolt against homogenized consumerism."}
              </p>
              <p>
                {isZh
                  ? "在 Koçer 著作《Dub Techno: The Orphic Experience of Sound》中，耳机并非隔离外界的被动工具，而是向内构筑宏大精神神殿的奥菲斯媒介（Orphic Media）。低频的深渊与回响，是大脑内部建筑的情绪骨架。"
                  : "In Koçer's work 'Dub Techno: The Orphic Experience of Sound', headphones are not passive isolation tools, but Orphic Media constructing an internal subterranean cathedral inside the mind. Sub-bass resonance becomes the emotional infrastructure of inner architecture."}
              </p>
            </div>
          )}
        </div>

        {/* Chapter 4: The Sound Design Blueprint */}
        <div className="py-3">
          <button
            onClick={() => toggleSection(4)}
            className="w-full flex items-center justify-between text-left group hover:text-text transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold text-[#f5b73d]">04</span>
              <span className="text-xs font-bold text-text group-hover:text-[#f5b73d] transition-colors">
                {isZh ? "Ableton Operator 三层合成工程蓝图" : "ABLETON OPERATOR // 3-LAYER SYNTHESIS BLUEPRINT"}
              </span>
            </div>
            {openSection === 4 ? (
              <ChevronUp className="w-4 h-4 text-[#f5b73d]" />
            ) : (
              <ChevronDown className="w-4 h-4 text-text-dim" />
            )}
          </button>

          {openSection === 4 && (
            <div className="mt-3 text-xs leading-relaxed space-y-3 pl-6 border-l border-[#f5b73d]/40">
              <p>
                {isZh
                  ? "在 Ableton Live 中使用 Operator 或类似 FM/加法合成器构建三层解剖底鼓的标准机架配置："
                  : "Standard Ableton Operator routing matrix to replicate this 3-layer somatic kick drum:"}
              </p>

              <div className="bg-black/60 p-3 rounded border border-line/60 font-mono text-[11px] space-y-2">
                <div className="text-[#f5b73d] font-bold">ALGORITHM: PARALLEL 4-OSC (ALL OSCILLATORS DIRECT TO OUTPUT)</div>
                <ul className="list-disc list-inside space-y-1 text-text-sub">
                  <li><strong className="text-white">OSC A (Sub):</strong> Sine Wave · Fixed Freq 45 Hz · Decay 450ms · Pitch Env +24st (35ms drop)</li>
                  <li><strong className="text-white">OSC B (Thump):</strong> Triangle Wave · Fixed Freq 120 Hz · Decay 80ms · Soft Drive Tanh</li>
                  <li><strong className="text-white">OSC C (Click):</strong> Square / White Noise · Highpass 1.8 kHz · Decay 6ms · Fast Attack 0.1ms</li>
                  <li><strong className="text-white">MASTER BUS:</strong> Saturator (Analog Clip 3dB) · Utility (Mono Bass &lt; 140 Hz) · Glue Limiter</li>
                </ul>
              </div>

              <p className="text-[11px] text-text-dim">
                {isZh
                  ? "提示：本工作台右上角提供了「导出 WAV」功能，可直接将当前调节的纯算法底鼓导出为 24-bit 无损采样，拖拽进 Ableton 或任何硬件采样器中直接使用。"
                  : "Tip: The 'EXPORT WAV' button exports your customized algorithmic kick as a studio-grade 24-bit PCM WAV sample ready for your DAW or hardware sampler."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
