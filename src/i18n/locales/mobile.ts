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
  // The capped vertical rail borrowed from the desktop timeline view (`TIMELINE_STORIES`).
  mobile_home_timeline: { en: "A century of groove", zh: "百年律动时间轴" },
  // Each era node is more than a year: how many genres it coined, where they came from, and the
  // accessible name of the link that opens one. The category label reuses `mobile_home_categories`.
  mobile_home_timeline_genres: { en: "{count} genres", zh: "{count} 个曲风" },
  mobile_home_timeline_from: { en: "From", zh: "源自" },
  mobile_home_timeline_style: { en: "Style", zh: "风格" },
  mobile_home_timeline_more_places: { en: "+{count} more", zh: "另有 {count}" },
  mobile_home_timeline_open_genre: { en: "Open {genre}", zh: "打开{genre}" },
  mobile_audition_play: { en: "Audition this genre", zh: "试听这个曲风" },
  mobile_audition_stop: { en: "Stop the audition", zh: "停止试听" },
  mobile_genre_open_detail: { en: "Full details", zh: "查看完整详情" },

  // The multi-level genre picker (`MobileGenrePicker`): a category level, a genre level and a filter.
  // Its search/count/empty strings are shared with the library above; only the title and the six
  // category names are new, because the library printed the raw data category and the picker does not.
  mobile_genre_picker_title: { en: "Choose a genre", zh: "选择曲风" },
  mobile_genre_picker_categories: { en: "Browse by category", zh: "按分类浏览" },
  mobile_category_electronic: { en: "Electronic", zh: "电子" },
  mobile_category_rock_metal: { en: "Rock/Metal", zh: "摇滚/金属" },
  mobile_category_hip_hop: { en: "Hip Hop", zh: "嘻哈" },
  mobile_category_jazz_blues: { en: "Jazz/Blues", zh: "爵士/布鲁斯" },
  mobile_category_latin_world: { en: "Latin/World", zh: "拉丁/世界" },
  mobile_category_pop_rnb: { en: "Pop/R&B", zh: "流行/R&B" },

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
  mobile_detail_tap_back: { en: "Tap to go back", zh: "点一下返回" },
  mobile_detail_missing: { en: "That genre is not in the library.", zh: "曲风库里没有这个曲风。" },
  /**
   * The second pass over 曲风详情: lineage and the production movements.
   *
   * The `{names}` slot is filled with a run of tappable genre names, so these strings are templates in
   * the same sense as `formatMessage`'s: the screen splits each one on the literal slot and interleaves
   * React nodes, because a name cannot travel through a string.
   */
  mobile_detail_lineage: { en: "Lineage & evolution", zh: "传承与演变" },
  // The three stage labels of the lineage flow diagram. They are annotations written along a rail,
  // not headings, so they stay short enough to sit beside a node marker.
  mobile_detail_flow_from: { en: "From", zh: "源头" },
  mobile_detail_flow_to: { en: "Into", zh: "衍生" },
  mobile_detail_flow_related: { en: "Crossovers", zh: "交叉与影响" },
  mobile_detail_lineage_from: { en: "Evolved from {names}", zh: "从 {names} 演化而来" },
  mobile_detail_lineage_led_to: { en: ", and directly gave rise to {names}", zh: "，又直接催生了 {names}" },
  mobile_detail_lineage_led_to_only: { en: "It directly gave rise to {names}", zh: "直接催生了 {names}" },
  mobile_detail_lineage_fusion: { en: "Fused with {names}", zh: "融合了 {names}" },
  mobile_detail_lineage_influence: { en: "Also cross-influenced by {names}", zh: "也受到 {names} 的影响" },
  mobile_detail_lineage_variant: { en: "Regional variants: {names}", zh: "在地变体：{names}" },
  mobile_detail_era_contemporary: { en: "{era} · contemporary with {names}", zh: "{era} · 与 {names} 同时代" },
  mobile_detail_character_context: { en: "Character & context", zh: "听感与背景" },
  mobile_detail_rhythm: { en: "Rhythm", zh: "律动骨架" },
  mobile_detail_sound: { en: "Sound & harmony", zh: "音色与和声" },
  mobile_detail_progressions: { en: "Progressions", zh: "常用走向" },
  mobile_detail_era: { en: "Era", zh: "年代" },
  mobile_detail_key_scale: { en: "Key / scale", zh: "调式音阶" },
  mobile_detail_default_tempo: { en: "Default tempo", zh: "默认速度" },

  // Player bar (M2) and the full-screen player (M3).
  mobile_player_now: { en: "Now playing", zh: "正在播放" },
  mobile_player_pause: { en: "Pause", zh: "暂停" },
  mobile_player_play: { en: "Play", zh: "播放" },
  mobile_player_open: { en: "Open the player", zh: "打开播放器" },
  mobile_player_mode_one: { en: "Repeat one", zh: "单曲循环" },
  mobile_player_mode_style: { en: "Repeat this genre", zh: "大曲风内循环" },
  mobile_player_mode_all: { en: "Shuffle all genres", zh: "全部随机" },
  mobile_player_collapse: { en: "Collapse", zh: "收起" },
  mobile_player_scrub_hint: { en: "Drag the record: left slower, right faster", zh: "按住唱片左右拖动：左减速 右加速" },
  // The player2.html port: its top bar, progress meta line, list and label footer.
  mobile_player_tagline: { en: "Pocket groove machine", zh: "口袋律动机" },
  mobile_player_status_idle: { en: "Idle", zh: "待机" },
  mobile_player_status_dropping: { en: "Dropping the needle…", zh: "落针…" },
  mobile_player_status_playing: { en: "Playing", zh: "播放中" },
  mobile_player_realtime: { en: "Realtime synth", zh: "实时合成" },
  mobile_player_loop: { en: "Loop", zh: "循环" },
  mobile_player_tap_detail: { en: "Tap the record for the genre page", zh: "轻点唱片看曲风详情" },
  mobile_player_label_footer: { en: "GROOVE REC · 33 1/3 RPM", zh: "GROOVE REC · 33 1/3 RPM" },
  mobile_player_slow: { en: "Slower", zh: "减慢" },
  mobile_player_footer: { en: "GROOVE — a studio, in your pocket.", zh: "GROOVE — 把一间录音室，收进口袋。" },
  mobile_player_fast: { en: "Faster", zh: "加快" },

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
  mobile_jam_metronome: { en: "Metronome", zh: "节拍器" },
  mobile_jam_bpm: { en: "BPM", zh: "BPM" },
  mobile_jam_lane_kick: { en: "Kick", zh: "底鼓" },
  mobile_jam_lane_snare: { en: "Snare", zh: "军鼓" },
  mobile_jam_lane_hat: { en: "Hat", zh: "踩镲" },
  mobile_jam_lane_bass: { en: "Bass", zh: "贝斯" },
  mobile_jam_lane_perc: { en: "Perc", zh: "打击乐" },
  mobile_jam_lane_chords: { en: "Chords", zh: "和声" },
  mobile_jam_pad_clap: { en: "Clap", zh: "拍手" },
  mobile_jam_pad_rim: { en: "Rim", zh: "边击" },

  // 挑战 (challenge, M5).
  mobile_challenge_score: { en: "Ladder", zh: "天梯积分" },
  mobile_challenge_streak: { en: "Streak", zh: "连胜/最佳" },
  mobile_challenge_accuracy: { en: "Accuracy", zh: "正确率" },
  mobile_challenge_difficulty: { en: "Difficulty", zh: "难度" },
  mobile_challenge_easy: { en: "Easy · well known", zh: "初级 · 主流大类" },
  mobile_challenge_medium: { en: "Medium · subgenres", zh: "进阶 · 细分子类" },
  mobile_challenge_hard: { en: "Hard · near misses", zh: "硬核 · 近速干扰" },
  mobile_challenge_question: { en: "Which genre is playing?", zh: "刚才听到的是哪个曲风？" },
  mobile_challenge_correct: { en: "Correct", zh: "答对了" },
  mobile_challenge_wrong: { en: "Not quite", zh: "答错了" },
  mobile_challenge_answer_is: { en: "The answer was", zh: "答案是" },
  mobile_challenge_next: { en: "Next question", zh: "下一题" },
  /* The pinned answer bar. `{points}` is what the answer paid; on a wrong answer it is 0, which is the
     honest number rather than a hidden chip. */
  mobile_challenge_earned: { en: "+{points} pts", zh: "+{points} 分" },
  mobile_challenge_streak_now: { en: "Streak {count}", zh: "连胜 {count}" },
  /* Only ever shown on a right answer: the question is about to change by itself. A wrong answer says
     nothing here on purpose — the user leaves when they have finished reading. */
  mobile_challenge_auto_next: { en: "Next in a moment…", zh: "自动进入下一题…" },
  mobile_challenge_to_next: { en: "{points} to the next rank", zh: "距下一段位 {points}" },
  mobile_challenge_top: { en: "Top rank", zh: "已是最高段位" },

  // 探索 (explore, M6).
  mobile_explore_kick: { en: "Kick design", zh: "底鼓设计" },
  mobile_explore_chords: { en: "Progressions", zh: "和弦走向" },
  mobile_explore_groove: { en: "Groove layers", zh: "律动解构" },
  mobile_explore_kick_fire: { en: "Fire the kick", zh: "击发底鼓" },
  mobile_explore_kick_layers: { en: "Three layers", zh: "三层身体" },
  mobile_explore_kick_soft: { en: "Softness", zh: "柔软度" },
  mobile_explore_kick_grit: { en: "Grit", zh: "砂砾感" },
  mobile_explore_kick_low: { en: "Sub weight", zh: "内脏压力" },
  mobile_explore_kick_presets: { en: "Presets", zh: "底鼓预设" },
  mobile_explore_groove_all: { en: "All four lanes in", zh: "四轨全开" },
  mobile_explore_groove_dropped: { en: "Dropped", zh: "已拿掉" },

  // 更多 (more, M7).
  mobile_more_appearance: { en: "Appearance", zh: "外观" },
  mobile_more_appearance_hint: { en: "Skin", zh: "皮肤" },
  mobile_more_settings: { en: "Settings", zh: "设置" },
  mobile_more_updates: { en: "What's new", zh: "更新日志" },
  mobile_more_help: { en: "Manual & tours", zh: "手册与引导" },
  mobile_more_search: { en: "Search genres and views", zh: "搜索曲风与页面" },
  mobile_more_language: { en: "Language", zh: "语言" },
  mobile_more_player: { en: "Player", zh: "播放器" },
  mobile_light_player: { en: "Lighter player", zh: "精简动效" },
  mobile_light_player_hint: {
    en: "Stops the record's motion — the sound is unchanged",
    zh: "关闭唱片动效以省电，声音不变",
  },
  mobile_more_about: { en: "Groove Lab · an interactive genre atlas and sequencer", zh: "Groove Lab · 交互式曲风图谱与音序器" },
};
