/**
 * Phone shell strings (M-series, `PRODUCT_PLAN_v2.1.0.md` §M).
 *
 * Kept in its own locale file rather than appended to `common.ts`: the phone IA is a separate
 * surface with its own vocabulary (five module names, not the desktop's thirteen destinations), and
 * a module that gets rewritten should not have to hunt its strings through the whole dictionary.
 */
export const mobileMessages = {
  // Module names: the user's own wording.
  mobile_module_home: { en: "Home", zh: "首页" },
  mobile_module_jam: { en: "Jam", zh: "即兴" },
  mobile_module_challenge: { en: "Challenge", zh: "挑战" },
  mobile_module_explore: { en: "Explore", zh: "探索" },
  mobile_module_more: { en: "More", zh: "更多" },
  mobile_shell_title: { en: "Groove", zh: "律动" },

  // Home / genre library.
  mobile_home_title: { en: "Genres", zh: "曲风库" },
  mobile_home_lede: { en: "Tap a card to audition · open for details", zh: "点卡片试听 · 展开看详情" },
  mobile_home_search: { en: "Search a genre", zh: "搜索曲风" },
  mobile_home_categories: { en: "Categories", zh: "分类" },
  mobile_home_all: { en: "All", zh: "全部" },
  mobile_home_empty: { en: "Nothing matches that search.", zh: "没有匹配的曲风。" },
  mobile_audition_play: { en: "Audition this genre", zh: "试听这个曲风" },
  mobile_audition_stop: { en: "Stop the audition", zh: "停止试听" },
  mobile_genre_open_detail: { en: "Full details", zh: "查看完整详情" },

  // Honest placeholders for the modules that are still being rebuilt.
  mobile_module_building: { en: "Rebuilding for the phone", zh: "手机版正在重建" },
  mobile_module_home_plan: {
    en: "Genre library, player bar and genre details.",
    zh: "曲风库、播放条与曲风详情。",
  },
  mobile_module_jam_plan: {
    en: "Groove editor, pads, record/play, tempo at the bottom.",
    zh: "律动编排、打击垫、录制/播放，速度条在底部。",
  },
  mobile_module_challenge_plan: {
    en: "Blind listening quiz: difficulty, rank ladder, four options, explanation.",
    zh: "盲听辨曲：难度、天梯积分、四选一与解析。",
  },
  mobile_module_explore_plan: {
    en: "Kick design, chord progressions, groove deconstruction — portrait and landscape.",
    zh: "底鼓设计、和弦走向、律动解构——横竖屏都适配。",
  },
  mobile_module_more_plan: {
    en: "Settings, updates, help, language, about.",
    zh: "设置、更新日志、帮助、语言与关于。",
  },

  // Genre detail (M2).
  mobile_back: { en: "Back", zh: "返回" },
  mobile_detail_overview: { en: "Overview", zh: "概览" },
  mobile_detail_character: { en: "Character", zh: "听感特征" },
  mobile_detail_context: { en: "Context", zh: "文化背景" },
  mobile_detail_instruments: { en: "Instrumentation", zh: "编制" },
  mobile_detail_related: { en: "Related genres", zh: "相近曲风" },
  mobile_detail_origin: { en: "Origin", zh: "发源" },
  mobile_detail_time_signature: { en: "Time", zh: "拍号" },
  mobile_detail_bpm_range: { en: "Range", zh: "区间" },
  mobile_detail_try_jam: { en: "Jam with this", zh: "拿去即兴" },
  mobile_detail_missing: { en: "That genre is not in the library.", zh: "曲风库里没有这个曲风。" },

  // Player bar (M2) and the full-screen player (M3).
  mobile_player_now: { en: "Now playing", zh: "正在播放" },
  mobile_player_pause: { en: "Pause", zh: "暂停" },
  mobile_player_play: { en: "Play", zh: "播放" },
  mobile_player_open: { en: "Open the player", zh: "打开播放器" },
  mobile_player_mode_one: { en: "Repeat one", zh: "单曲循环" },
  mobile_player_mode_style: { en: "Repeat this genre", zh: "大曲风内循环" },
  mobile_player_mode_all: { en: "Shuffle all genres", zh: "全部随机" },
  mobile_player_collapse: { en: "Collapse", zh: "收起" },

  // 即兴 (jam, M4).
  mobile_jam_title: { en: "Jam", zh: "即兴" },
  mobile_jam_backing: { en: "Backing", zh: "伴奏曲风" },
  mobile_jam_record: { en: "Record", zh: "录制" },
  mobile_jam_record_on: { en: "Recording — tap a pad to write it in", zh: "录制中——点打击垫写入当前步" },
  mobile_jam_play: { en: "Play", zh: "播放" },
  mobile_jam_stop: { en: "Stop", zh: "停止" },
  mobile_jam_grid: { en: "Groove", zh: "律动编排" },
  mobile_jam_grid_hint: { en: "Tap a step to toggle it", zh: "点格子开关该步" },
  mobile_jam_reset: { en: "Reset to the genre", zh: "还原母版" },
  mobile_jam_pads: { en: "Pads", zh: "打击垫" },
  mobile_jam_pads_hint: { en: "Arm record, then tap to write it in", zh: "开录制后点按即写入当前步" },
  mobile_jam_tempo: { en: "Tempo", zh: "速度" },
  mobile_jam_swing: { en: "Swing", zh: "摇摆" },
  mobile_jam_bpm: { en: "BPM", zh: "BPM" },
  mobile_jam_lane_kick: { en: "Kick", zh: "底鼓" },
  mobile_jam_lane_snare: { en: "Snare", zh: "军鼓" },
  mobile_jam_lane_hat: { en: "Hat", zh: "踩镲" },
  mobile_jam_lane_bass: { en: "Bass", zh: "贝斯" },
  mobile_jam_pad_clap: { en: "Clap", zh: "拍手" },
  mobile_jam_pad_rim: { en: "Rim", zh: "边击" },
};
