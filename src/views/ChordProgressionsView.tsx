import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  RotateCcw, 
  Plus, 
  Trash2, 
  Music, 
  Sliders, 
  Sparkles, 
  Volume2, 
  Copy, 
  Check, 
  Download, 
  Search, 
  BookOpen, 
  Piano as PianoIcon, 
  Layers, 
  ArrowRight,
  Disc3,
  ExternalLink
} from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { 
  ChordDefinition, 
  ChordQuality, 
  CHORD_QUALITY_META, 
  NOTE_NAMES, 
  formatChordName, 
  romanToChord, 
  getChordMidiNotes 
} from "../utils/chordTheory";
import { 
  POPULAR_PROGRESSIONS, 
  POPULAR_PROGRESSION_CATEGORIES, 
  PopularProgression 
} from "../data/popularProgressions";
import { 
  ChordAudioEngine, 
  InstrumentTimbre, 
  PlayingStyle, 
  ChordPlaybackInfo 
} from "../audio/ChordAudioEngine";
import { PianoKeyboardVisualizer } from "../components/chords/PianoKeyboardVisualizer";
import { GuitarFretboardVisualizer } from "../components/chords/GuitarFretboardVisualizer";
import { MidiExporter } from "../audio/MidiExporter";

interface ChordProgressionsViewProps {
  onOpenStudioWithChords?: (chords: string[]) => void;
}

export const ChordProgressionsView: React.FC<ChordProgressionsViewProps> = ({
  onOpenStudioWithChords,
}) => {
  const { t, language } = useLanguage();

  // Audio Engine instance (lazy singleton)
  const engineRef = useRef<ChordAudioEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new ChordAudioEngine();
  }

  // Builder State
  const [keyRoot, setKeyRoot] = useState<string>("C");
  const [isMinorKey, setIsMinorKey] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(110);
  const [timbre, setTimbre] = useState<InstrumentTimbre>("piano");
  const [style, setStyle] = useState<PlayingStyle>("ballad");
  const [isLooping, setIsLooping] = useState<boolean>(true);

  // Active progression chords in workspace
  const [customChords, setCustomChords] = useState<ChordDefinition[]>([
    { root: "C", quality: "maj", duration: 4 },
    { root: "G", quality: "maj", duration: 4 },
    { root: "A", quality: "min", duration: 4 },
    { root: "F", quality: "maj", duration: 4 },
  ]);
  const [selectedChordIdx, setSelectedChordIdx] = useState<number>(0);

  // Playback state
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activePlaybackChordIdx, setActivePlaybackChordIdx] = useState<number>(-1);
  const [activePlaybackNotes, setActivePlaybackNotes] = useState<number[]>([]);

  // Category filter & search for curated catalog
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [previewingProgId, setPreviewingProgId] = useState<string | null>(null);

  // Active Visualizer Tab
  const [visualizerTab, setVisualizerTab] = useState<"piano" | "guitar">("piano");

  // Copy feedback state
  const [copied, setCopied] = useState<boolean>(false);

  // Stop audio on unmount
  useEffect(() => {
    return () => {
      engineRef.current?.stop();
    };
  }, []);

  // Synchronize engine parameters
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.setBpm(bpm);
      engineRef.current.setTimbre(timbre);
      engineRef.current.setStyle(style);
      engineRef.current.setLoop(isLooping);
    }
  }, [bpm, timbre, style, isLooping]);

  // Selected chord object
  const currentChord = customChords[selectedChordIdx] || customChords[0];

  // Visualizer active notes: if playing, show active notes; otherwise show selected chord notes
  const displayedNotes = useMemo(() => {
    if (isPlaying && activePlaybackNotes.length > 0) {
      return activePlaybackNotes;
    }
    if (currentChord) {
      return getChordMidiNotes(currentChord.root, currentChord.quality, 4, currentChord.inversion || 0, timbre);
    }
    return [];
  }, [isPlaying, activePlaybackNotes, currentChord, timbre]);

  // Filter curated progressions
  const filteredProgressions = useMemo(() => {
    return POPULAR_PROGRESSIONS.filter((prog) => {
      const matchCat = selectedCategory === "all" || prog.category === selectedCategory;
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase();
      const matchName = prog.name.zh.toLowerCase().includes(q) || prog.name.en.toLowerCase().includes(q);
      const matchRoman = prog.roman.join(" ").toLowerCase().includes(q);
      const matchSong = prog.songs.some(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
      return matchName || matchRoman || matchSong;
    });
  }, [selectedCategory, searchQuery]);

  // Trigger single chord preview
  const handleAuditionChord = useCallback((chord: ChordDefinition) => {
    if (!engineRef.current) return;
    const notes = engineRef.current.triggerChord(chord, timbre, style);
    setActivePlaybackNotes(notes);
  }, [timbre, style]);

  // Play/Stop custom progression
  const handleTogglePlay = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    } else {
      setIsPlaying(true);
      setPreviewingProgId(null);
      engine.startProgression(customChords, (info: ChordPlaybackInfo) => {
        setActivePlaybackChordIdx(info.chordIndex);
        setActivePlaybackNotes(info.activeNotes);
      });
    }
  }, [isPlaying, customChords]);

  // Quick preview curated progression
  const handlePreviewProgression = useCallback((prog: PopularProgression) => {
    const engine = engineRef.current;
    if (!engine) return;

    if (previewingProgId === prog.id && isPlaying) {
      engine.stop();
      setIsPlaying(false);
      setPreviewingProgId(null);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    } else {
      // Map progression chords to current key
      const mappedChords = prog.roman.map((rom) => {
        const { root, quality } = romanToChord(rom, keyRoot, isMinorKey);
        return { root, quality, duration: 4 };
      });

      setIsPlaying(true);
      setPreviewingProgId(prog.id);
      engine.setBpm(prog.suggestedBpm);
      setBpm(prog.suggestedBpm);
      engine.setTimbre(prog.suggestedTimbre);
      setTimbre(prog.suggestedTimbre);
      engine.setStyle(prog.suggestedStyle);
      setStyle(prog.suggestedStyle);

      engine.startProgression(mappedChords, (info: ChordPlaybackInfo) => {
        setActivePlaybackChordIdx(info.chordIndex);
        setActivePlaybackNotes(info.activeNotes);
      });
    }
  }, [previewingProgId, isPlaying, keyRoot, isMinorKey]);

  // Load curated progression into workspace
  const handleLoadProgression = useCallback((prog: PopularProgression) => {
    const mappedChords = prog.roman.map((rom) => {
      const { root, quality } = romanToChord(rom, keyRoot, isMinorKey);
      return { root, quality, duration: 4 };
    });

    setCustomChords(mappedChords);
    setSelectedChordIdx(0);
    setBpm(prog.suggestedBpm);
    setTimbre(prog.suggestedTimbre);
    setStyle(prog.suggestedStyle);

    // Stop previous preview
    if (engineRef.current) {
      engineRef.current.stop();
      setIsPlaying(false);
      setPreviewingProgId(null);
      setActivePlaybackChordIdx(-1);
      setActivePlaybackNotes([]);
    }

    // Scroll to builder section smoothly
    const builderEl = document.getElementById("chord-builder-workspace");
    if (builderEl) {
      builderEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [keyRoot, isMinorKey]);

  // Update specific chord in workspace
  const handleUpdateChord = useCallback((idx: number, updates: Partial<ChordDefinition>) => {
    setCustomChords((prev) => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], ...updates };
      }
      return next;
    });
  }, []);

  // Add a chord block
  const handleAddChord = useCallback(() => {
    setCustomChords((prev) => [
      ...prev,
      { root: keyRoot, quality: "maj", duration: 4 },
    ]);
    setSelectedChordIdx(customChords.length);
  }, [keyRoot, customChords.length]);

  // Remove chord block
  const handleRemoveChord = useCallback((idx: number) => {
    if (customChords.length <= 1) return;
    setCustomChords((prev) => prev.filter((_, i) => i !== idx));
    setSelectedChordIdx((prev) => Math.max(0, Math.min(prev, customChords.length - 2)));
  }, [customChords.length]);

  // Copy chord progression text
  const handleCopyText = useCallback(() => {
    const text = customChords.map(c => formatChordName(c.root, c.quality, c.inversion)).join(" - ");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [customChords]);

  // Export MIDI file
  const handleExportMidi = useCallback(() => {
    const chordNames = customChords.map(c => formatChordName(c.root, c.quality));
    MidiExporter.exportChordsMidi(customChords, bpm, `Groove_Progression_${keyRoot}.mid`);
  }, [customChords, bpm, keyRoot]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-10 text-[#eae6dc]">
      
      {/* 1. Header Banner */}
      <div className="relative rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[#121622] via-[#0d1017] to-[#0a0c12] border border-[#23262d] shadow-2xl overflow-hidden">
        <div className="absolute -right-16 -top-16 w-80 h-80 bg-[#f5b73d]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute right-32 bottom-0 w-64 h-64 bg-[#4ad8c8]/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col gap-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-[#f5b73d]/20 text-[#f5b73d] border border-[#f5b73d]/40">
                Hooktheory Theorytab Reference
              </span>
              <span className="text-xs text-[#8b8f99]">·</span>
              <span className="text-xs text-[#8b8f99]">全功能和弦走向库与物理音色合成</span>
            </div>

            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-light tracking-tight text-white font-[Space_Grotesk]">
              和弦走向与律动工坊
              <span className="block text-sm sm:text-base font-normal text-[#d8b988] mt-1 font-serif">
                Chord Progressions & Harmonic Voicing Studio
              </span>
            </h1>

            <p className="text-xs sm:text-sm text-[#8b8f99] leading-relaxed">
              汇聚百年来流行金曲、影视卡农、J-Pop 王道、爵士 2-5-1 与朋克金属 Power 和弦的代表性走向。
              内置真实物理声学钢琴与原声/失真吉他合成模型，随时挑选具体和弦进行二次创作。
            </p>
          </div>

          {/* Quick Key & Scale Configurator */}
          <div className="bg-[#181d28]/80 backdrop-blur-md rounded-xl p-4 border border-[#2a303f] flex flex-col gap-3 min-w-[260px] shadow-lg">
            <div className="flex items-center justify-between text-xs text-[#8b8f99] pb-2 border-b border-white/5">
              <span>全局基础调性 (Key)</span>
              <span className="font-mono text-[#f5b73d] font-bold">{keyRoot} {isMinorKey ? "小调 Minor" : "大调 Major"}</span>
            </div>

            <div className="flex items-center gap-2">
              {/* Root Key Selector */}
              <div className="flex-1">
                <label className="block text-[10px] text-[#8b8f99] mb-1">主音 (Root)</label>
                <select
                  value={keyRoot}
                  onChange={(e) => setKeyRoot(e.target.value)}
                  className="w-full bg-[#0a0d14] border border-[#333a4a] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5b73d]"
                >
                  {NOTE_NAMES.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Mode Selector */}
              <div className="flex-1">
                <label className="block text-[10px] text-[#8b8f99] mb-1">调式 (Mode)</label>
                <select
                  value={isMinorKey ? "minor" : "major"}
                  onChange={(e) => setIsMinorKey(e.target.value === "minor")}
                  className="w-full bg-[#0a0d14] border border-[#333a4a] rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-[#f5b73d]"
                >
                  <option value="major">自然大调 (Major)</option>
                  <option value="minor">自然小调 (Minor)</option>
                </select>
              </div>
            </div>

            <div className="text-[11px] text-[#8b8f99] flex items-center justify-between pt-1">
              <span>当前对应音阶：</span>
              <span className="font-mono text-zinc-300 text-[10px]">
                {keyRoot} · {isMinorKey ? "D · Eb · F · G · Ab · Bb" : "D · E · F · G · A · B"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Curated Popular Progressions (Hooktheory Theorytab) */}
      <section className="flex flex-col gap-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-lg sm:text-xl font-medium text-white">
              <BookOpen className="w-5 h-5 text-[#f5b73d]" />
              <h2>常见分类和弦走向 (Hooktheory 经典分类)</h2>
            </div>
            <p className="text-xs text-[#8b8f99] mt-0.5">
              点击试听或一键载入工作台进行自由拓展与乐器音色实验
            </p>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#8b8f99]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜索走向、歌曲或艺术家..."
              className="w-full bg-[#121622] border border-[#23262d] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#5a5e68] focus:outline-none focus:border-[#f5b73d]"
            />
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {POPULAR_PROGRESSION_CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-[#f5b73d] text-zinc-950 shadow-[0_0_12px_rgba(245,183,61,0.3)] font-semibold"
                  : "bg-[#121622] text-[#8b8f99] hover:bg-[#181e2e] hover:text-white border border-[#23262d]"
              }`}
            >
              {language === "zh" ? cat.nameZh : cat.nameEn}
            </button>
          ))}
        </div>

        {/* Progressions Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProgressions.map((prog) => {
            const isThisPreviewing = previewingProgId === prog.id && isPlaying;

            // Map roman numerals to real chords in current active keyRoot
            const translatedChords = prog.roman.map((rom) => {
              const { displayName } = romanToChord(rom, keyRoot, isMinorKey);
              return displayName;
            });

            return (
              <div
                key={prog.id}
                className={`flex flex-col justify-between rounded-xl p-5 bg-[#10141e] border transition-all duration-200 group relative ${
                  isThisPreviewing 
                    ? "border-[#f5b73d] shadow-[0_0_20px_rgba(245,183,61,0.2)] bg-[#141926]" 
                    : "border-[#202532] hover:border-[#384156] hover:bg-[#131824]"
                }`}
              >
                {/* Card Top */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-semibold text-[#f5b73d] uppercase tracking-wider block mb-1">
                        {prog.emotion.zh}
                      </span>
                      <h3 className="text-base font-semibold text-white group-hover:text-[#f5b73d] transition-colors leading-snug">
                        {prog.name.zh}
                      </h3>
                      <span className="text-[11px] text-[#8b8f99] font-serif block">
                        {prog.name.en}
                      </span>
                    </div>

                    <div className="shrink-0 flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/5 text-zinc-300 border border-white/10">
                        {prog.suggestedBpm} BPM
                      </span>
                    </div>
                  </div>

                  {/* Roman Numeral Stream + Key Mapped Chords */}
                  <div className="p-3 rounded-lg bg-[#0a0d14] border border-[#1f2533] flex flex-col gap-2">
                    {/* Roman numerals */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {prog.roman.map((r, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#1a2232] text-[#f5b73d] border border-[#f5b73d]/30"
                        >
                          {r}
                        </span>
                      ))}
                    </div>

                    {/* Real translated chords in key */}
                    <div className="flex items-center gap-1 text-xs text-[#8b8f99] pt-1 border-t border-white/5">
                      <span className="text-[10px] text-[#5a5e68]">在 {keyRoot} 调实装：</span>
                      <span className="font-mono text-white font-semibold">
                        {translatedChords.join(" ─ ")}
                      </span>
                    </div>
                  </div>

                  {/* Description */}
                  <p className="text-xs text-[#8b8f99] line-clamp-2 leading-relaxed">
                    {prog.description.zh}
                  </p>

                  {/* Famous Songs (Hooktheory Theorytab) */}
                  <div className="pt-2 border-t border-[#1f2533]">
                    <span className="text-[10px] text-[#5a5e68] block mb-1">代表热单与作品：</span>
                    <div className="flex flex-wrap gap-1.5">
                      {prog.songs.slice(0, 3).map((s, si) => (
                        <span
                          key={si}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-[#d8b988] border border-white/5"
                        >
                          {s.title} ({s.artist})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Bottom Actions */}
                <div className="flex items-center justify-between gap-2 mt-5 pt-3 border-t border-[#1f2533]">
                  {/* Play / Preview Button */}
                  <button
                    type="button"
                    onClick={() => handlePreviewProgression(prog)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isThisPreviewing
                        ? "bg-[#f5b73d] text-zinc-950 font-bold shadow-[0_0_10px_rgba(245,183,61,0.5)]"
                        : "bg-[#1c2230] text-white hover:bg-[#252e42]"
                    }`}
                  >
                    {isThisPreviewing ? (
                      <>
                        <Square className="w-3.5 h-3.5 fill-current" />
                        <span>停止试听</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>试听走向</span>
                      </>
                    )}
                  </button>

                  {/* Load to Custom Builder */}
                  <button
                    type="button"
                    onClick={() => handleLoadProgression(prog)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#f5b73d]/10 hover:bg-[#f5b73d]/20 text-[#f5b73d] border border-[#f5b73d]/30 transition-colors"
                  >
                    <span>载入工作台</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Interactive Progression Builder & Studio Workspace */}
      <section 
        id="chord-builder-workspace"
        className="flex flex-col gap-6 rounded-2xl p-6 sm:p-8 bg-[#0e111a] border border-[#232a3b] shadow-2xl relative"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-[#1f2533]">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4ad8c8] shadow-[0_0_8px_#4ad8c8]" />
              <h2 className="text-xl sm:text-2xl font-semibold text-white font-[Space_Grotesk]">
                和弦走向创作工作台 (Custom Progression Builder)
              </h2>
            </div>
            <p className="text-xs text-[#8b8f99] mt-1">
              自由搭配任意和弦（Power 和弦、大/小三和弦、七和弦、扩展和弦），选择钢琴或吉他音色，即时伴奏试听并导出 MIDI。
            </p>
          </div>

          {/* Master Transport & Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Play / Stop Master */}
            <button
              type="button"
              onClick={handleTogglePlay}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-lg ${
                isPlaying && previewingProgId === null
                  ? "bg-[#e84855] hover:bg-[#ff5566] text-white shadow-[0_0_15px_rgba(232,72,85,0.4)]"
                  : "bg-[#f5b73d] hover:bg-[#ffc65c] text-zinc-950 shadow-[0_0_15px_rgba(245,183,61,0.4)]"
              }`}
            >
              {isPlaying && previewingProgId === null ? (
                <>
                  <Square className="w-4 h-4 fill-current" />
                  <span>停止播放</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>循环播放进行</span>
                </>
              )}
            </button>

            {/* Loop Toggle */}
            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-2 rounded-xl border text-xs transition-colors ${
                isLooping 
                  ? "bg-[#4ad8c8]/20 border-[#4ad8c8] text-[#4ad8c8]" 
                  : "bg-[#181d28] border-[#2b3242] text-[#8b8f99]"
              }`}
              title="循环开关 (Loop)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            {/* BPM Slider */}
            <div className="flex items-center gap-2 bg-[#141824] px-3 py-1.5 rounded-xl border border-[#232a3b]">
              <span className="text-[10px] text-[#8b8f99]">BPM</span>
              <input
                type="range"
                min={40}
                max={220}
                value={bpm}
                onChange={(e) => setBpm(Number(e.target.value))}
                className="w-20 accent-[#f5b73d] h-1.5 bg-[#232a3b] rounded cursor-pointer"
              />
              <span className="text-xs font-mono font-bold text-white w-8 text-right">{bpm}</span>
            </div>

            {/* Copy Progression Text */}
            <button
              type="button"
              onClick={handleCopyText}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2030] border border-[#232a3b] text-xs text-[#d8b988] transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "已复制" : "复制和弦"}</span>
            </button>

            {/* Export MIDI */}
            <button
              type="button"
              onClick={handleExportMidi}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#141824] hover:bg-[#1a2030] border border-[#232a3b] text-xs text-white transition-colors"
              title="导出为标准 MIDI 文件"
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出 MIDI</span>
            </button>
          </div>
        </div>

        {/* Timbre & Style Selector Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-[#121622] border border-[#1f2533]">
          {/* Instrument Timbre Selector (支持钢琴或吉他) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5" />
              <span>乐器音色 (Instrument Timbre)</span>
            </label>
            <div className="grid grid-cols-3 gap-1 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]">
              <button
                type="button"
                onClick={() => setTimbre("piano")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "piano" ? "bg-[#f5b73d] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                钢琴 Piano
              </button>
              <button
                type="button"
                onClick={() => setTimbre("guitar")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "guitar" ? "bg-[#f5b73d] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                原声吉他 Guitar
              </button>
              <button
                type="button"
                onClick={() => setTimbre("power-guitar")}
                className={`px-2 py-1.5 rounded text-xs font-medium transition-colors ${
                  timbre === "power-guitar" ? "bg-[#f5b73d] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                失真吉他 Power
              </button>
            </div>
          </div>

          {/* Playing Style */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              <span>伴奏律动风格 (Playing Style)</span>
            </label>
            <div className="grid grid-cols-4 gap-1 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]">
              <button
                type="button"
                onClick={() => setStyle("ballad")}
                className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  style === "ballad" ? "bg-[#4ad8c8] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                抒情 Pop
              </button>
              <button
                type="button"
                onClick={() => setStyle("strum")}
                className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  style === "strum" ? "bg-[#4ad8c8] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                扫弦 Strum
              </button>
              <button
                type="button"
                onClick={() => setStyle("arpeggio")}
                className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  style === "arpeggio" ? "bg-[#4ad8c8] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                琶音 Arp
              </button>
              <button
                type="button"
                onClick={() => setStyle("block")}
                className={`px-1.5 py-1.5 rounded text-[11px] font-medium transition-colors ${
                  style === "block" ? "bg-[#4ad8c8] text-zinc-950 font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                柱式 Block
              </button>
            </div>
          </div>

          {/* Visualizer Display Toggle */}
          <div className="flex flex-col gap-1.5 lg:col-span-2">
            <label className="text-[11px] font-semibold text-[#d8b988] flex items-center gap-1.5">
              <PianoIcon className="w-3.5 h-3.5" />
              <span>实时指板/琴键可视化模式 (Visualizer Display)</span>
            </label>
            <div className="flex items-center gap-2 bg-[#0a0d14] p-1 rounded-lg border border-[#232a3b]">
              <button
                type="button"
                onClick={() => setVisualizerTab("piano")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  visualizerTab === "piano" ? "bg-[#2a3346] text-white font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                钢琴琴键 (Piano Keyboard)
              </button>
              <button
                type="button"
                onClick={() => setVisualizerTab("guitar")}
                className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors ${
                  visualizerTab === "guitar" ? "bg-[#2a3346] text-white font-bold" : "text-[#8b8f99] hover:text-white"
                }`}
              >
                吉他指板 (Guitar Fretboard)
              </button>
            </div>
          </div>
        </div>

        {/* 3.1 Timeline Chord Blocks Sequence */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-[#8b8f99]">
            <span>和弦音序通道 (点击和弦方块进行编辑调色)</span>
            <span className="font-mono">共 {customChords.length} 个小节和弦</span>
          </div>

          <div className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
            {customChords.map((chord, idx) => {
              const isSelected = selectedChordIdx === idx;
              const isCurrentlyPlaying = isPlaying && activePlaybackChordIdx === idx;
              const chordName = formatChordName(chord.root, chord.quality, chord.inversion);

              return (
                <div
                  key={idx}
                  onClick={() => {
                    setSelectedChordIdx(idx);
                    handleAuditionChord(chord);
                  }}
                  className={`relative shrink-0 w-32 sm:w-36 rounded-xl p-3.5 flex flex-col justify-between cursor-pointer transition-all duration-200 border select-none group ${
                    isCurrentlyPlaying
                      ? "bg-[#1a2336] border-[#f5b73d] shadow-[0_0_18px_rgba(245,183,61,0.4)] scale-105"
                      : isSelected
                      ? "bg-[#151a26] border-[#4ad8c8] shadow-[0_0_14px_rgba(74,216,200,0.25)] ring-2 ring-[#4ad8c8]/30"
                      : "bg-[#11151f] border-[#222838] hover:border-[#3a445e] hover:bg-[#141926]"
                  }`}
                >
                  {/* Delete Chord Button */}
                  {customChords.length > 1 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveChord(idx);
                      }}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/40 hover:bg-[#e84855] text-zinc-400 hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all text-xs"
                      title="删除此和弦"
                    >
                      ✕
                    </button>
                  )}

                  {/* Header: Bar Number & Duration */}
                  <div className="flex items-center justify-between text-[10px] text-[#8b8f99] mb-2 font-mono">
                    <span>小节 {idx + 1}</span>
                    <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/5">
                      {chord.duration || 4} 拍
                    </span>
                  </div>

                  {/* Chord Large Display */}
                  <div className="text-center py-2">
                    <div className="text-2xl font-bold font-mono tracking-tight text-white group-hover:text-[#f5b73d] transition-colors">
                      {chordName}
                    </div>
                    <div className="text-[11px] text-[#8b8f99] font-serif mt-0.5">
                      {CHORD_QUALITY_META[chord.quality]?.nameZh}
                    </div>
                  </div>

                  {/* Bottom: Play Chord Audition */}
                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px]">
                    <span className="text-zinc-500 font-mono">
                      {chord.inversion ? `转位 ${chord.inversion}` : "原位"}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAuditionChord(chord);
                      }}
                      className="text-[#f5b73d] hover:underline"
                    >
                      试听音色
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Add Chord Block Button */}
            <button
              type="button"
              onClick={handleAddChord}
              className="shrink-0 w-28 sm:w-32 rounded-xl border-2 border-dashed border-[#2b3345] hover:border-[#f5b73d] hover:bg-[#181d28]/60 text-[#8b8f99] hover:text-white flex flex-col items-center justify-center gap-2 transition-all p-4"
            >
              <Plus className="w-5 h-5 text-[#f5b73d]" />
              <span className="text-xs font-medium">添加和弦</span>
            </button>
          </div>
        </div>

        {/* 3.2 Chord Palette & Inspector (选择 Power 和弦、3和弦、7和弦等) */}
        {currentChord && (
          <div className="p-5 rounded-xl bg-[#121624] border border-[#202738] flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-[#f5b73d] text-black">
                  正在编辑：小节 {selectedChordIdx + 1}
                </span>
                <span className="text-base font-bold text-white font-mono">
                  {formatChordName(currentChord.root, currentChord.quality, currentChord.inversion)}
                </span>
              </div>
              <span className="text-xs text-[#8b8f99]">
                点击下方按钮即时切换根音、和弦家族与具体类型
              </span>
            </div>

            {/* Root Note Picker (12 Semitones) */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#8b8f99]">1. 选择根音 (Root Note)</span>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {NOTE_NAMES.map((note) => (
                  <button
                    key={note}
                    type="button"
                    onClick={() => {
                      handleUpdateChord(selectedChordIdx, { root: note });
                      handleAuditionChord({ ...currentChord, root: note });
                    }}
                    className={`py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      currentChord.root === note
                        ? "bg-[#f5b73d] text-zinc-950 shadow-[0_0_10px_rgba(245,183,61,0.5)]"
                        : "bg-[#181d2c] text-[#eae6dc] hover:bg-[#252d42] border border-[#2a344d]"
                    }`}
                  >
                    {note}
                  </button>
                ))}
              </div>
            </div>

            {/* Specific Chord Type Categories (Power和弦 / 3和弦 / 7和弦 / 扩展和弦) */}
            <div className="flex flex-col gap-3 pt-2">
              <span className="text-[11px] font-semibold text-[#8b8f99]">
                2. 选择具体和弦类型 (Power 和弦 / 3和弦 / 7和弦 / 扩展色彩和弦)
              </span>

              {/* Category 1: Power 和弦 (Rock / Metal 必备) */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#e84855] font-bold flex items-center gap-1">
                  <span>⚡ POWER 和弦 (Power Chords / 5和弦 · 纯五度摇滚)</span>
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      handleUpdateChord(selectedChordIdx, { quality: "5" });
                      handleAuditionChord({ ...currentChord, quality: "5" });
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all border ${
                      currentChord.quality === "5"
                        ? "bg-[#e84855] border-[#ff5566] text-white shadow-[0_0_12px_rgba(232,72,85,0.6)]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                    }`}
                  >
                    {currentChord.root}5 (五和弦 · 纯根音+五音)
                  </button>
                </div>
              </div>

              {/* Category 2: 3 和弦 (Triads) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-[#4ad8c8] font-bold">
                  ● 基础 3 和弦 (Triads · 大三/小三/挂二/挂四/减/增)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["maj", "min", "sus2", "sus4", "dim", "aug"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-[#4ad8c8] border-[#4ad8c8] text-zinc-950 font-bold shadow-[0_0_10px_rgba(74,216,200,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {CHORD_QUALITY_META[q].nameZh}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category 3: 7 和弦 (7th Chords) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-[#f5b73d] font-bold">
                  ★ 经典 7 和弦 (7th Chords · 大七/小七/属七/半减七/减七)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["maj7", "min7", "7", "m7b5", "dim7", "mMaj7"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-[#f5b73d] border-[#f5b73d] text-zinc-950 font-bold shadow-[0_0_10px_rgba(245,183,61,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {CHORD_QUALITY_META[q].nameZh}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Category 4: 扩展/色彩和弦 (Extended & Color Chords) */}
              <div className="flex flex-col gap-1 pt-1">
                <span className="text-[10px] text-[#d47fa6] font-bold">
                  ◆ 扩展色彩和弦 (Extended & Ninth Chords · 加九/大九/小九/六和弦)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {(["add9", "maj9", "min9", "9", "6", "m6"] as ChordQuality[]).map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { quality: q });
                        handleAuditionChord({ ...currentChord, quality: q });
                      }}
                      className={`p-2 rounded-lg text-xs font-medium text-left transition-all border ${
                        currentChord.quality === q
                          ? "bg-[#d47fa6] border-[#d47fa6] text-zinc-950 font-bold shadow-[0_0_10px_rgba(212,127,166,0.4)]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc] hover:bg-[#222838]"
                      }`}
                    >
                      <div className="font-mono font-bold text-sm">
                        {currentChord.root}{CHORD_QUALITY_META[q].symbol}
                      </div>
                      <div className="text-[10px] opacity-75 truncate">
                        {CHORD_QUALITY_META[q].nameZh}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Inversion & Duration settings */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-white/5">
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[#8b8f99]">3. 和弦转位 (Inversion)</span>
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((inv) => (
                    <button
                      key={inv}
                      type="button"
                      onClick={() => {
                        handleUpdateChord(selectedChordIdx, { inversion: inv as any });
                        handleAuditionChord({ ...currentChord, inversion: inv as any });
                      }}
                      className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        (currentChord.inversion || 0) === inv
                          ? "bg-[#f5b73d] text-zinc-950 font-bold border-[#f5b73d]"
                          : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                      }`}
                    >
                      {inv === 0 ? "原位 Root" : inv === 1 ? "第一转位 (3音)" : "第二转位 (5音)"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-semibold text-[#8b8f99]">4. 小节时值 (Duration)</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateChord(selectedChordIdx, { duration: 4 })}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      (currentChord.duration || 4) === 4
                        ? "bg-[#4ad8c8] text-zinc-950 font-bold border-[#4ad8c8]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                    }`}
                  >
                    4 拍 (完整 1 小节)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateChord(selectedChordIdx, { duration: 2 })}
                    className={`py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                      (currentChord.duration || 4) === 2
                        ? "bg-[#4ad8c8] text-zinc-950 font-bold border-[#4ad8c8]"
                        : "bg-[#181c28] border-[#293042] text-[#eae6dc]"
                    }`}
                  >
                    2 拍 (半小节快速切换)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3.3 Live Piano / Guitar Visualizer Panel */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-[#f5b73d]" />
              <span>当前和弦真实乐器指法与键盘映射</span>
            </span>
            <span className="text-xs font-mono text-[#d8b988]">
              {formatChordName(currentChord.root, currentChord.quality, currentChord.inversion)}
            </span>
          </div>

          {visualizerTab === "piano" ? (
            <PianoKeyboardVisualizer
              activeNotes={displayedNotes}
              rootMidi={displayedNotes[0]}
              onKeyClick={(midi) => {
                if (engineRef.current) {
                  engineRef.current.triggerChord({ root: currentChord.root, quality: currentChord.quality });
                }
              }}
            />
          ) : (
            <GuitarFretboardVisualizer
              rootNote={currentChord.root}
              quality={currentChord.quality}
              onStringClick={(midi) => {
                if (engineRef.current) {
                  engineRef.current.triggerChord({ root: currentChord.root, quality: currentChord.quality });
                }
              }}
            />
          )}
        </div>
      </section>

    </div>
  );
};
