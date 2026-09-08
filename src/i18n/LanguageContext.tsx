import React, { createContext, useContext, useState, useEffect } from "react";

export type Language = "en" | "zh";

export interface Translations {
  [key: string]: {
    en: string;
    zh: string;
  };
}

export const DICTIONARY: Translations = {
  // Navigation & Brand
  app_title: { en: "Groove & Genre Odyssey", zh: "音乐曲风探索与律动工作台" },
  app_subtitle: { en: "Interactive Music Genre Learning & Sequencer", zh: "沉浸式交互曲风百科与步进音序器" },
  nav_studio: { en: "Groove Studio", zh: "律动工作台" },
  nav_chords: { en: "Chord Progressions", zh: "和弦走向" },
  nav_galaxy: { en: "Genre Galaxy", zh: "星系云团" },
  nav_timeline_h: { en: "Horizontal Timeline", zh: "水平演变轴" },
  nav_timeline_v: { en: "Vertical Timeline", zh: "垂直时间轴" },
  nav_compare: { en: "Genre Compare", zh: "曲风对比" },
  nav_challenge: { en: "Ear Challenge", zh: "听辨挑战" },

  // Timeline Scale & Labels
  timeline_scale_nonlinear: { en: "Non-linear Adaptive Scale", zh: "非线性自适应轴" },
  timeline_scale_linear: { en: "Linear Equal Decades", zh: "等距年代轴" },
  timeline_groove_core: { en: "Groove Core", zh: "律动核心" },
  timeline_iconic_gear: { en: "Classic Gear", zh: "经典设备" },
  timeline_pioneers: { en: "Pioneers", zh: "代表人物" },
  timeline_lineage: { en: "Evolutionary Lineage", zh: "演变溯源" },
  timeline_play_preview: { en: "Audition", zh: "试听" },
  timeline_stop_preview: { en: "Stop", zh: "停止" },

  // Common UI
  search_placeholder: { en: "Search 150+ genres, aliases, BPM, tags... (Cmd+K)", zh: "搜索 150+ 曲风、别名、BPM、标签... (Cmd+K)" },
  search_no_results: { en: "No matching genres found", zh: "未找到匹配的曲风" },
  random_genre: { en: "Random Genre", zh: "随机探索" },
  view_detail: { en: "View Detail", zh: "查看详情" },
  open_in_studio: { en: "Open in Studio", zh: "在工作台打开" },
  back: { en: "Back", zh: "返回" },
  all_categories: { en: "All Categories", zh: "所有分类" },
  all_decades: { en: "All Decades", zh: "全部年代" },
  clear_filter: { en: "Clear Filters", zh: "清除筛选" },
  pickGenre: { en: "Quick Select", zh: "快速选曲" },
  drums_only: { en: "Drums Only", zh: "只播放鼓组" },
  full_band: { en: "Full Tracks", zh: "全部音轨" },

  // Sequencer Studio
  bpm: { en: "BPM", zh: "速度 (BPM)" },
  swing: { en: "Swing", zh: "摇摆度 (Swing)" },
  master_vol: { en: "Master Vol", zh: "总音量" },
  play: { en: "Play", zh: "播放" },
  pause: { en: "Pause", zh: "暂停" },
  stop: { en: "Stop", zh: "停止" },
  clear_pattern: { en: "Clear", zh: "清空" },
  reset_pattern: { en: "Reset to Preset", zh: "重置预设" },
  restore: { en: "Reset to preset", zh: "已重置为预设" },
  undo: { en: "Undo", zh: "撤销" },
  redo: { en: "Redo", zh: "重做" },
  undo_tip: { en: "Undo (Ctrl+Z / Cmd+Z)", zh: "撤销 (Ctrl+Z / Cmd+Z)" },
  redo_tip: { en: "Redo (Ctrl+Shift+Z / Cmd+Shift+Z)", zh: "重做 (Ctrl+Shift+Z / Cmd+Shift+Z)" },
  undo_done: { en: "Undone", zh: "已撤销" },
  redo_done: { en: "Redone", zh: "已重做" },
  export_midi: { en: "Export MIDI", zh: "导出 MIDI" },
  share_groove: { en: "Share Pattern", zh: "分享律动" },
  share_copied: { en: "Share link copied to clipboard!", zh: "分享链接已复制到剪贴板！" },
  mode_demo: { en: "Demo Mode", zh: "演示模式" },
  mode_edit: { en: "Edit Mode", zh: "编辑模式" },
  solo: { en: "S", zh: "独奏" },
  mute: { en: "M", zh: "静音" },
  velocity: { en: "Velocity", zh: "力度" },
  pitch: { en: "Pitch", zh: "音高" },
  scale: { en: "Scale / Mode", zh: "调式 / 音阶" },
  root_key: { en: "Key", zh: "基调" },

  // Detail Page
  origin_year: { en: "Origin Year", zh: "起源年份" },
  origin_place: { en: "Origin Region", zh: "发源地" },
  tempo_range: { en: "Tempo Range", zh: "典型速度" },
  time_signature: { en: "Time Signature", zh: "拍号" },
  drum_features: { en: "Drum & Groove Characteristics", zh: "鼓组与节奏特征" },
  kick_placement: { en: "Kick Drum", zh: "底鼓布局" },
  snare_placement: { en: "Snare / Clap", zh: "军鼓 / 拍手" },
  hihat_pattern: { en: "Hi-Hat Pattern", zh: "踩镲律动" },
  bass_design: { en: "Bassline & Sound Design", zh: "贝斯与低频音色" },
  harmonic_rules: { en: "Harmonic Rules & Progressions", zh: "和声规则与经典走向" },
  sound_design_tips: { en: "Production & Sound Design Tips", zh: "制作与音色调制秘诀" },
  culture_background: { en: "Cultural Context & History", zh: "文化背景与历史沿革" },
  representative_tracks: { en: "Essential Tracks & Milestones", zh: "必听经典代表作" },
  related_genres: { en: "Related Genres", zh: "关联曲风" },
  subgenres: { en: "Subgenres & Offshoots", zh: "子曲风与分支" },
  parents: { en: "Direct Ancestors", zh: "源头母体" },
  listen_link: { en: "Listen", zh: "试听" },

  // Compare View
  compare_title: { en: "Genre Side-by-Side Comparison", zh: "曲风多维并排对比" },
  compare_add: { en: "Add Genre to Compare", zh: "添加对比曲风" },
  similarity_score: { en: "DNA Similarity", zh: "曲风相似度" },
  bpm_overlap: { en: "BPM Overlap", zh: "速度交叠区间" },
  radar_chart: { en: "Sonic Radar Analysis", zh: "声学特性多维雷达图" },
  sync_play: { en: "Play Both Grooves (A/B Test)", zh: "同步试听 (A/B 对比)" },
  audition_mode: { en: "Audition Playback Mode", zh: "音频试听模式" },
  core_specs: { en: "Core Specifications", zh: "基础核心规格" },
  groove_dna: { en: "Rhythm & Drum DNA", zh: "律动与鼓组 DNA" },
  bass_harmony: { en: "Bass & Harmonic Architecture", zh: "低频与和声架构" },
  sonic_radar: { en: "Acoustic Radar Metrics", zh: "声学特性雷达指标" },
  milestones: { en: "Essential Tracks & Milestones", zh: "里程碑代表作品" },
  compare_presets: { en: "Classic Matchups", zh: "经典对比预设" },
  stop_audition: { en: "Stop Audition", zh: "停止试听" },
  audition_btn: { en: "Audition Groove", zh: "试听律动" },
  now_playing: { en: "Now Playing", zh: "正在试听" },

  // Quiz Challenge
  challenge_title: { en: "Genre Ear Training Challenge", zh: "曲风听力大师挑战赛" },
  challenge_subtitle: { en: "Listen to the synthetic groove and identify the genre!", zh: "仔细聆听纯合成节奏，辨别出是哪种音乐曲风！" },
  difficulty_easy: { en: "Easy (Major Genres)", zh: "初级 (主流大类)" },
  difficulty_medium: { en: "Medium (Subgenres & BPM clues)", zh: "进阶 (细分子类与典型节奏)" },
  difficulty_hard: { en: "Hard (Underground & Niche)", zh: "硬核 (小众地下与硬核探索)" },
  score: { en: "Score", zh: "得分" },
  streak: { en: "Current Streak", zh: "连胜" },
  best_streak: { en: "Best Streak", zh: "最佳连胜" },
  next_question: { en: "Next Question", zh: "下一题" },
  restart_quiz: { en: "Play Again", zh: "再玩一次" },
  quiz_explanation: { en: "Genre Analysis & Breakdown", zh: "曲风深度解析" },

  // Galaxy
  galaxy_title: { en: "Interactive Sonic Constellation", zh: "交互式声学星系云团" },
  legend_direct_origin: { en: "Direct Ancestor", zh: "直接起源" },
  legend_influence: { en: "Influence / Heritage", zh: "影响渗透" },
  legend_derivation: { en: "Derivation / Subgenre", zh: "衍生分支" },
  legend_fusion: { en: "Fusion & Hybrid", zh: "融合交叉" },
  zoom_in: { en: "Zoom In (+)", zh: "放大 (+)" },
  zoom_out: { en: "Zoom Out (-)", zh: "缩小 (-)" },
  reset_view: { en: "Reset View", zh: "重置视角" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>("zh");

  useEffect(() => {
    // 1. Check local storage
    const saved = localStorage.getItem("groove_language") as Language | null;
    if (saved === "en" || saved === "zh") {
      setLanguageState(saved);
    } else {
      // 2. Check browser language
      const navLang = navigator.language || (navigator as any).userLanguage || "";
      if (navLang.toLowerCase().startsWith("zh")) {
        setLanguageState("zh");
      } else {
        setLanguageState("en");
      }
    }
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem("groove_language", lang);
    } catch (e) {
      // Ignore localStorage errors
    }
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "zh" : "en");
  };

  const t = (key: string): string => {
    const entry = DICTIONARY[key];
    if (!entry) return key;
    return entry[language] || entry.en || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};
