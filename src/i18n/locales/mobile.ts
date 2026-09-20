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
};
