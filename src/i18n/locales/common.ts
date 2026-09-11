export const commonMessages = {
  // Brand & Navigation
  app_title: { en: "Groove Odyssey", zh: "音乐曲风探索与律动工作台" },
  app_subtitle: { en: "Interactive Music Genre Learning & Sequencer", zh: "沉浸式交互曲风百科与步进音序器" },
  nav_studio: { en: "Studio", zh: "律动工作台" },
  nav_chords: { en: "Chords", zh: "和弦走向" },
  nav_explore: { en: "Explore", zh: "探索" },
  nav_galaxy: { en: "Galaxy", zh: "星系云团" },
  nav_timeline_h: { en: "Timeline H", zh: "水平演变轴" },
  nav_timeline_v: { en: "Timeline V", zh: "垂直时间轴" },
  nav_compare: { en: "Compare", zh: "曲风对比" },
  nav_challenge: { en: "Challenge", zh: "听辨挑战" },
  nav_galaxy_desc: { en: "3D Cosmic Map", zh: "3D 星系图谱" },
  nav_timeline_h_desc: { en: "Chronology", zh: "年代编年演变轴" },
  nav_timeline_v_desc: { en: "Storylines", zh: "流派故事脉络" },

  // Language Switch
  lang_switch_target: { en: "中", zh: "EN" },
  lang_switch_title: { en: "Switch Language", zh: "切换语言" },

  // Common Actions
  ok: { en: "OK", zh: "确定" },
  cancel: { en: "Cancel", zh: "取消" },
  close: { en: "Close", zh: "关闭" },
  save: { en: "Save", zh: "保存" },
  reset: { en: "Reset", zh: "重置" },
  retry: { en: "Retry", zh: "重试" },
  copy: { en: "Copy", zh: "复制" },
  copied: { en: "Copied!", zh: "已复制" },
  delete: { en: "Delete", zh: "删除" },
  back: { en: "Back", zh: "返回" },
  fold: { en: "Fold", zh: "收起" },
  expand: { en: "Expand", zh: "展开" },
  play: { en: "Play", zh: "播放" },
  pause: { en: "Pause", zh: "暂停" },
  stop: { en: "Stop", zh: "停止" },
  clear: { en: "Clear", zh: "清空" },
  audition: { en: "Audition", zh: "试听" },
  apply: { en: "Apply", zh: "应用" },

  // Search & Filters
  search_placeholder: { en: "Search 150+ genres, BPM, tags... (Cmd+K)", zh: "搜索 150+ 曲风、别名、BPM、标签... (Cmd+K)" },
  search_no_results: { en: "No matching genres", zh: "未找到匹配的曲风" },
  random_genre: { en: "Random", zh: "随机探索" },
  all_categories: { en: "All Genres", zh: "所有分类" },
  all_decades: { en: "All Decades", zh: "全部年代" },
  clear_filter: { en: "Clear", zh: "清除筛选" },
  pickGenre: { en: "Quick Pick", zh: "快速选曲" },
  view_detail: { en: "Detail", zh: "查看详情" },
  open_in_studio: { en: "Studio", zh: "在工作台打开" },

  // Loading & Chunk
  loading_chunk: { en: "Loading Chunk...", zh: "正在按需加载曲风模块..." },

  // Error Boundaries
  error_studio_title: { en: "Studio View Error", zh: "编曲工作台运行异常" },
  error_studio_desc: { en: "Audio engine or sequencer matrix encountered an unexpected error.", zh: "音频引擎或音序矩阵遇到意外异常，您可以尝试重试。" },
  error_chord_title: { en: "Chord Studio Error", zh: "和弦工作台运行异常" },
  error_chord_desc: { en: "Chord progression analysis encountered an error. You can retry or return to Studio.", zh: "和弦走向或理论分析模块遇到异常，可重试或返回主工作台。" },
  error_galaxy_title: { en: "3D Galaxy View Error", zh: "3D 星系星云运行异常" },
  error_galaxy_desc: { en: "WebGL renderer encountered an issue. You can retry or switch to Timeline view.", zh: "WebGL 3D 渲染器或粒子系统遇到异常，可尝试重试或切换至时间线浏览曲风。" },
  error_timeline_h_title: { en: "Timeline View Error", zh: "年代演化时间线异常" },
  error_timeline_v_title: { en: "Vertical Timeline Error", zh: "纵向编年史异常" },
  error_compare_title: { en: "Compare View Error", zh: "双曲风对比工作台异常" },
  error_challenge_title: { en: "Challenge View Error", zh: "听辨挑战模块异常" },
  error_detail_title: { en: "Genre Detail Error", zh: "曲风档案详情异常" },
  btn_return_studio: { en: "Studio", zh: "返回工作台" },
  btn_browse_timeline: { en: "Timeline", zh: "浏览时间线" },

  // Header & Footer
  header_explore_title: { en: "Exploration Views", zh: "曲风探索视图" },
  header_check_updates_title: { en: "Check for updates & changelog", zh: "检查更新与更新记录" },
  header_updates_btn: { en: "Updates & Changelog", zh: "检查更新 & 更新记录" },
  footer_check_updates: { en: "Check updates & changelog", zh: "检查更新与版本记录" },
  footer_updates_btn: { en: "Updates", zh: "更新记录" },
  footer_genres_tag: { en: "159 Synthetic Genres & Realtime Audio Synthesis", zh: "159 种电子与现代曲风合成器原生仿真" },
  footer_open_source: { en: "Dual Audio Synthesis Engine · Web Audio API & Tone Generation", zh: "双音频合成引擎驱动 · Web Audio 原生实时发声" },
} as const;
