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
  app_title: { en: "Groove Odyssey", zh: "音乐曲风探索与律动工作台" },
  app_subtitle: { en: "Interactive Music Genre Learning & Sequencer", zh: "沉浸式交互曲风百科与步进音序器" },
  nav_studio: { en: "Studio", zh: "律动工作台" },
  nav_chords: { en: "Chords", zh: "和弦走向" },
  nav_galaxy: { en: "Galaxy", zh: "星系云团" },
  nav_timeline_h: { en: "Timeline H", zh: "水平演变轴" },
  nav_timeline_v: { en: "Timeline V", zh: "垂直时间轴" },
  nav_compare: { en: "Compare", zh: "曲风对比" },
  nav_challenge: { en: "Challenge", zh: "听辨挑战" },

  // Timeline Scale & Labels
  timeline_scale_nonlinear: { en: "Adaptive", zh: "非线性自适应轴" },
  timeline_scale_linear: { en: "Equal Decades", zh: "等距年代轴" },
  timeline_groove_core: { en: "Groove Core", zh: "律动核心" },
  timeline_iconic_gear: { en: "Classic Gear", zh: "经典设备" },
  timeline_pioneers: { en: "Pioneers", zh: "代表人物" },
  timeline_lineage: { en: "Lineage", zh: "演变溯源" },
  timeline_play_preview: { en: "Audition", zh: "试听" },
  timeline_stop_preview: { en: "Stop", zh: "停止" },

  // Common UI
  search_placeholder: { en: "Search 150+ genres, BPM, tags... (Cmd+K)", zh: "搜索 150+ 曲风、别名、BPM、标签... (Cmd+K)" },
  search_no_results: { en: "No matching genres", zh: "未找到匹配的曲风" },
  random_genre: { en: "Random", zh: "随机探索" },
  view_detail: { en: "Detail", zh: "查看详情" },
  open_in_studio: { en: "Studio", zh: "在工作台打开" },
  back: { en: "Back", zh: "返回" },
  all_categories: { en: "All Genres", zh: "所有分类" },
  all_decades: { en: "All Decades", zh: "全部年代" },
  clear_filter: { en: "Clear", zh: "清除筛选" },
  pickGenre: { en: "Quick Pick", zh: "快速选曲" },
  drums_only: { en: "Drums", zh: "只播放鼓组" },
  full_band: { en: "Full Band", zh: "全部音轨" },

  // Sequencer Studio
  bpm: { en: "BPM", zh: "速度 (BPM)" },
  swing: { en: "Swing", zh: "摇摆度" },
  master_vol: { en: "Master", zh: "总音量" },
  play: { en: "Play", zh: "播放" },
  pause: { en: "Pause", zh: "暂停" },
  stop: { en: "Stop", zh: "停止" },
  clear_pattern: { en: "Clear", zh: "清空" },
  reset_pattern: { en: "Reset", zh: "重置预设" },
  restore: { en: "Preset", zh: "已重置为预设" },
  undo: { en: "Undo", zh: "撤销" },
  redo: { en: "Redo", zh: "重做" },
  undo_tip: { en: "Undo (Ctrl+Z)", zh: "撤销 (Ctrl+Z / Cmd+Z)" },
  redo_tip: { en: "Redo (Ctrl+Shift+Z)", zh: "重做 (Ctrl+Shift+Z / Cmd+Shift+Z)" },
  undo_done: { en: "Undone", zh: "已撤销" },
  redo_done: { en: "Redone", zh: "已重做" },
  export_midi: { en: "MIDI", zh: "导出 MIDI" },
  share_groove: { en: "Share", zh: "分享律动" },
  share_copied: { en: "Link copied!", zh: "分享链接已复制到剪贴板！" },
  share_failed: { en: "Failed to create link", zh: "分享链接生成失败" },
  mode_demo: { en: "Demo", zh: "演示模式" },
  mode_edit: { en: "Edit", zh: "编辑模式" },
  solo: { en: "S", zh: "独奏" },
  mute: { en: "M", zh: "静音" },
  velocity: { en: "Velocity", zh: "力度" },
  pitch: { en: "Pitch", zh: "音高" },
  scale: { en: "Scale", zh: "调式 / 音阶" },
  root_key: { en: "Key", zh: "基调" },

  // Detail Page
  origin_year: { en: "Year", zh: "起源年份" },
  origin_place: { en: "Origin", zh: "发源地" },
  tempo_range: { en: "Tempo", zh: "典型速度" },
  time_signature: { en: "Meter", zh: "拍号" },
  drum_features: { en: "Drum Features", zh: "鼓组与节奏特征" },
  kick_placement: { en: "Kick", zh: "底鼓布局" },
  snare_placement: { en: "Snare / Clap", zh: "军鼓 / 拍手" },
  hihat_pattern: { en: "Hi-Hat", zh: "踩镲律动" },
  bass_design: { en: "Bassline", zh: "贝斯与低频音色" },
  harmonic_rules: { en: "Harmony", zh: "和声规则与经典走向" },
  sound_design_tips: { en: "Production Tips", zh: "制作与音色调制秘诀" },
  culture_background: { en: "Cultural Context", zh: "文化背景与历史沿革" },
  representative_tracks: { en: "Key Tracks", zh: "必听经典代表作" },
  representative_artists: { en: "Artists", zh: "先锋代表制作人" },
  instrumentation: { en: "Instruments", zh: "核心配器" },
  chord_inversions: { en: "Inversions", zh: "和弦转位与声部排列" },
  sound_design: { en: "Sound Design", zh: "音色设计" },
  rhythm_features: { en: "Rhythm DNA", zh: "核心律动特征" },
  structure: { en: "Structure", zh: "典型曲式结构" },
  related_genres: { en: "Related Genres", zh: "关联曲风" },
  subgenres: { en: "Subgenres", zh: "子曲风与分支" },
  parents: { en: "Ancestors", zh: "源头母体" },
  listen_link: { en: "Listen", zh: "试听" },

  // Compare View
  compare_title: { en: "Genre Comparison", zh: "曲风多维并排对比" },
  compare_add: { en: "Add Genre", zh: "添加对比曲风" },
  similarity_score: { en: "Similarity", zh: "曲风相似度" },
  bpm_overlap: { en: "BPM Range", zh: "速度交叠区间" },
  radar_chart: { en: "Acoustic Radar", zh: "声学特性多维雷达图" },
  sync_play: { en: "A/B Sync", zh: "A/B 同步试听" },
  sync_stop: { en: "Stop Sync", zh: "停止同步" },
  sync_mix: { en: "A+B Mix", zh: "A + B 混合" },
  sync_solo_a: { en: "Solo A", zh: "仅曲风 A" },
  sync_solo_b: { en: "Solo B", zh: "仅曲风 B" },
  sync_drums_only: { en: "Drums Only", zh: "仅骨架鼓组" },
  audition_mode: { en: "Playback", zh: "音频试听模式" },
  core_specs: { en: "Core Specs", zh: "基础核心规格" },
  groove_dna: { en: "Groove DNA", zh: "律动与鼓组 DNA" },
  bass_harmony: { en: "Bass & Harmony", zh: "低频与和声架构" },
  sonic_radar: { en: "Radar Metrics", zh: "声学特性雷达指标" },
  milestones: { en: "Milestones", zh: "里程碑代表作品" },
  compare_presets: { en: "Presets", zh: "经典对比预设" },
  stop_audition: { en: "Stop", zh: "停止试听" },
  audition_btn: { en: "Audition", zh: "试听律动" },
  now_playing: { en: "Playing", zh: "正在试听" },

  // Quiz Challenge
  challenge_title: { en: "Ear Challenge", zh: "曲风听力大师挑战赛" },
  challenge_subtitle: { en: "Listen to the synthetic groove and identify the genre!", zh: "仔细聆听纯合成节奏，辨别出是哪种音乐曲风！" },
  difficulty_easy: { en: "Easy", zh: "初级 (主流大类)" },
  difficulty_medium: { en: "Medium", zh: "进阶 (细分子类)" },
  difficulty_hard: { en: "Hard", zh: "硬核 (地下小众)" },
  score: { en: "Score", zh: "得分" },
  streak: { en: "Streak", zh: "连胜" },
  best_streak: { en: "Best Streak", zh: "最佳连胜" },
  next_question: { en: "Next Question", zh: "下一题" },
  restart_quiz: { en: "Play Again", zh: "再玩一次" },
  quiz_explanation: { en: "Analysis", zh: "曲风深度解析" },

  // Galaxy
  galaxy_title: { en: "Sonic Constellation", zh: "交互式声学星系云团" },
  legend_direct_origin: { en: "Ancestor", zh: "直接起源" },
  legend_influence: { en: "Heritage", zh: "影响渗透" },
  legend_derivation: { en: "Subgenre", zh: "衍生分支" },
  legend_fusion: { en: "Fusion", zh: "融合交叉" },
  zoom_in: { en: "Zoom In (+)", zh: "放大 (+)" },
  zoom_out: { en: "Zoom Out (-)", zh: "缩小 (-)" },
  reset_view: { en: "Reset View", zh: "重置视角" },

  // Studio Dossier & Info Cards
  era: { en: "ERA", zh: "时期" },
  place: { en: "ORIGIN", zh: "发源地" },
  range: { en: "TEMPO", zh: "速度范围" },
  keyLabel: { en: "KEY", zh: "调式 / 调号" },
  time: { en: "METER", zh: "拍号" },
  dna: { en: "GROOVE DNA", zh: "节奏与鼓组 DNA" },
  harm: { en: "HARMONY", zh: "和声与质感" },
  tips: { en: "PRO TIPS", zh: "制作要点" },
  refs: { en: "KEY TRACKS", zh: "代表作品" },
  compare: { en: "Compare", zh: "加入对比" },
  export: { en: "MIDI", zh: "导出 MIDI" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function getInitialLanguage(): Language {
  const storage = typeof window !== "undefined" && window.localStorage
    ? window.localStorage
    : typeof localStorage !== "undefined"
    ? localStorage
    : null;

  if (storage) {
    try {
      const saved = storage.getItem("groove_language") as Language | null;
      if (saved === "en" || saved === "zh") {
        return saved;
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  const nav = typeof navigator !== "undefined" ? navigator : null;
  if (nav) {
    const navLang = nav.language || (nav as any).userLanguage || "";
    const resolved: Language = navLang.toLowerCase().startsWith("zh") ? "zh" : "en";
    if (storage) {
      try {
        storage.setItem("groove_language", resolved);
      } catch {
        // Ignore localStorage write errors
      }
    }
    return resolved;
  }

  return "zh";
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
      document.title = language === "zh" 
        ? "GROOVE LAB | 音乐曲风探索与律动工作台" 
        : "GROOVE LAB | Music Genre Learning & Sequencer";
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
    if (!entry) {
      if (import.meta.env.DEV) {
        console.warn(`[i18n] Missing translation key: "${key}"`);
      }
      return key;
    }
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
