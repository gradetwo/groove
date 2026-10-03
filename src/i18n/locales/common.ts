export const commonMessages = {
  // ---------------------------------------------------------------------------
  // Skins (the appearance picker). App-wide on purpose: the skin belongs to the
  // product, not to one surface, so the phone shell and a future desktop picker
  // read the same four names.
  // ---------------------------------------------------------------------------
  skin_default_name: { en: "Aurora", zh: "极光冷色" },
  skin_default_blurb: {
    en: "Cool dark ground, one accent per module — the default.",
    zh: "冷调深底 · 每个模块一个强调色（默认）",
  },
  skin_minimal_name: { en: "Modern minimal", zh: "现代极简主义" },
  skin_minimal_blurb: {
    en: "Paper-white ground, hairline rules, one accent — nothing else.",
    zh: "纸白底、发丝细线、单一强调色，其余留白",
  },
  skin_comic_name: { en: "Retro comic", zh: "复古漫画" },
  skin_comic_blurb: {
    en: "Newsprint, halftone dots and heavy ink outlines.",
    zh: "新闻纸、网点与粗油墨描边",
  },
  skin_soviet_name: { en: "Heavy industry", zh: "苏联重工业" },
  skin_soviet_blurb: {
    en: "Stamped steel plates, rivets and signal lamps.",
    zh: "冲压钢板、铆钉与信号灯",
  },
  skin_soviet_years_name: { en: "Soviet years", zh: "苏联岁月" },
  skin_soviet_years_blurb: {
    en: "Constructivist posters: flag red, steel black, diagonal cuts, hard shadows.",
    zh: "构成主义宣传画：国旗红、钢铁黑、对角线切割、硬投影",
  },
  skin_pixel_name: { en: "8-bit pixel", zh: "8-bit 像素" },
  skin_pixel_blurb: {
    en: "Hard pixel edges, scanlines and a tiny palette.",
    zh: "硬像素边、扫描线与极小色板",
  },

  // Brand & Navigation
  app_title: { en: "Groove Odyssey", zh: "音乐曲风探索与工作台" },
  app_subtitle: { en: "Interactive Music Genre Learning & Sequencer", zh: "沉浸式交互曲风百科与步进音序器" },
  nav_studio: { en: "Studio", zh: "工作台" },
  // ⭐ A route rather than a tab: it opens the new arrangement, which deliberately has no genre.
  nav_new_project: { en: "New", zh: "新建" },
  nav_new_project_desc: { en: "Start a new arrangement", zh: "开一首全新的编排" },
  /**
   * ⭐ **The new project is named where it is created.** The chooser used to carry tempo, key and the first track's
   * kind and no name at all, so the arrangement this route builds had nothing to be called — which is why the top bar
   * had no name to show and nothing written here could be found again by name.
   */
  new_project_name: { en: "Project name", zh: "工程名" },
  new_project_name_placeholder: { en: "Enter project name...", zh: "输入工程名…" },
  new_project_default_name: { en: "Untitled Project", zh: "未命名工程" },
  /**
   * ⭐ The sentence over the chooser when a stored arrangement could not be read. The field that could not be read is
   * appended by the surface, because that is the part a person can act on (`docs/OPEN_WORK.md` §27.2).
   */
  arrangement_load_problem: { en: "The saved arrangement could not be read", zh: "已保存的编排读不出来" },
  template_drums_bass_desc: { en: "A drum kit and a bass — the most common pair", zh: "鼓组加贝斯，最常见的两件套" },
  template_drums_bass_chords_desc: { en: "Add chords and it can carry a whole song", zh: "再加一条和声，能撑起整首" },
  template_samplers_desc: { en: "Two sampler tracks — the kind that plays real instruments", zh: "两条采样器轨道——就是能听到真实乐器的那一种" },
  /**
   * ⭐ **The arrangement's track kinds, named by what makes the sound.**
   *
   * The kind called `instrument` was renamed `synth` because the word made a person who wanted a piano choose a
   * **built-in synthesiser whose timbre cannot be changed** — the report's "build an instrument track and hear
   * something muddy". The menu now says Synth/合成器 and a sampled instrument says Sampler/采样器.
   */
  kind_synth: { en: "Synth", zh: "合成器" },
  kind_sampler: { en: "Sampler", zh: "采样器" },
  kind_drumkit: { en: "Drum kit", zh: "鼓组" },
  kind_fx: { en: "FX", zh: "效果" },
  kind_folder: { en: "Folder", zh: "文件夹" },
  ruler_label: { en: "Arrangement ruler", zh: "编排标尺" },
  ruler_bar: { en: "Go to bar {bar}", zh: "跳到第 {bar} 小节" },
  // The arrangement's grid layout (see `docs/ARRANGEMENT_UI_DESIGN.md`). One toolbar, a fixed 240 px header column
  // beside the lanes, and a ruler over the lanes only.
  arrangement_toolbar_label: { en: "Arrangement toolbar", zh: "编排工具栏" },
  arrangement_play: { en: "Play", zh: "播放" },
  /**
   * ⭐ The play button's other half. The studio's transport has swapped its label between Play and Pause since
   * `Toolbar.tsx` was written; this is the same control on the arrangement, so it says the same thing — a button whose
   * word never changes is the button the owner reported as having no state.
   */
  arrangement_pause: { en: "Pause", zh: "暂停" },
  arrangement_stop: { en: "Stop", zh: "停止" },
  arrangement_record: { en: "Record", zh: "录音" },
  arrangement_recording: { en: "Recording…", zh: "录音中…" },
  arrangement_position: { en: "Position", zh: "位置" },
  arrangement_position_value: { en: "Bar {bar}.{beat}", zh: "第 {bar} 小节第 {beat} 拍" },
  arrangement_tempo: { en: "Tempo", zh: "速度" },
  arrangement_tempo_bpm: { en: "BPM", zh: "BPM" },
  arrangement_bars: { en: "Bars", zh: "小节数" },
  arrangement_snap: { en: "Snap", zh: "吸附" },
  arrangement_snap_toggle: { en: "Snap to grid", zh: "吸附到网格" },
  arrangement_snap_cycle: { en: "Change the snap value", zh: "切换吸附值" },
  arrangement_loop: { en: "Loop", zh: "循环" },
  arrangement_zoom_in: { en: "Zoom in", zh: "放大" },
  arrangement_zoom_out: { en: "Zoom out", zh: "缩小" },
  /**
   * ⭐ **The arrangement's own way in and out.**
   *
   * The menu items reuse the workbench's `toolbar_export_*` words, because they are the same six exports; what is new
   * here is the import entry, the per-item hints (the workbench's name a track count this route does not have), and the
   * sentences that say what happened. Every one of them is shown in the toolbar rather than swallowed, which is the
   * half of the owner's report that was about silence ("有些是功能有了，页面没做入口" and, behind it, no way to tell).
   */
  arrangement_import_label: { en: "Import", zh: "导入" },
  arrangement_import_title: { en: "Import a MIDI file (.mid) or a .groove project", zh: "导入 MIDI 文件（.mid）或 .groove 工程" },
  arrangement_import_done: { en: "Imported {filename} — {tracks} track(s), {notes} note(s)", zh: "已导入 {filename}——{tracks} 条轨道、{notes} 个音符" },
  arrangement_import_failed: { en: "Import failed: {error}", zh: "导入失败：{error}" },
  /**
   * ⭐ **The per-part instrument mapping**, the entry the import path shipped without. The part's own name is shown
   * verbatim and never passes through a translation; these are the words *around* it. `import_mapping_hint` says why
   * the dialog is asking rather than silently choosing — a MIDI file's track name is a name, not an identity.
   */
  import_mapping_title: { en: "Name the instruments", zh: "指定乐器" },
  import_mapping_hint: {
    en: "{filename} holds {parts} part(s). A MIDI file's part names are only names — unless it carries program changes, it says nothing about what each part is. Leave any part a synthesizer, or choose the instrument you know it is.",
    zh: "{filename} 里有 {parts} 个 part。MIDI 文件里的 part 名只是名字——除非它带 program change，否则它说不出每个 part 是什么。可以留作合成器，也可以指定你知道的乐器。",
  },
  import_mapping_notes: { en: "{count} note(s)", zh: "{count} 个音符" },
  import_mapping_keep_synth: { en: "Leave as synthesizer", zh: "留作合成器" },
  import_mapping_select_label: { en: "Instrument for the part named {part}", zh: "名为 {part} 的 part 用哪个乐器" },
  import_mapping_confirm: { en: "Import ({count} named)", zh: "导入（已指定 {count} 个）" },
  import_mapping_skip: { en: "Skip — keep synthesizers", zh: "跳过——留作合成器" },
  /** The executable next step after an import that named nothing (or only some parts): the tracks are said out loud. */
  arrangement_import_unassigned: {
    en: "{count} imported track(s) still play built-in synthesizers because no instrument was named: {names} — re-import the file and choose an instrument in this dialog, or add a sampler track and give it an asset",
    zh: "有 {count} 条导入的轨道因为没指定乐器，仍在用内置合成器：{names}——重新导入这个文件并在对话框里选乐器，或新建一条采样轨并指定资产",
  },
  arrangement_export_summary: { en: "{tracks} track(s), {notes} note(s)", zh: "{tracks} 条轨道、{notes} 个音符" },
  arrangement_export_failed: { en: "Export failed: {error}", zh: "导出失败：{error}" },
  /** One tail used by both directions: a writer's lost precision and a reader's unreadable measure are the same promise. */
  arrangement_file_problems: { en: "{count} thing(s) could not be carried exactly: {detail}", zh: "有 {count} 处无法精确携带：{detail}" },
  arrangement_export_hint_midi: { en: ".mid, one track per lane (format 1)", zh: ".mid，每轨一个 MIDI 轨道（format 1）" },
  arrangement_export_hint_als: { en: ".als, an Ableton Live Set", zh: ".als，Ableton Live 工程" },
  arrangement_export_hint_groove: { en: ".groove, the whole project", zh: ".groove，整个工程包" },
  arrangement_export_hint_wav: { en: "16-bit 44.1kHz PCM (.wav)", zh: "16-bit 44.1kHz PCM（.wav）" },
  arrangement_export_hint_mp3: { en: "192kbps CBR (.mp3)", zh: "192kbps CBR（.mp3）" },
  arrangement_export_hint_stems: { en: "one WAV per track (.zip)", zh: "每轨一个 WAV（.zip）" },
  /** The score's own interchange, in the Score tab's header — the one place a score leaves this building. */
  arrangement_musicxml_export: { en: "Export MusicXML", zh: "导出 MusicXML" },
  arrangement_musicxml_import: { en: "Import MusicXML", zh: "导入 MusicXML" },
  arrangement_musicxml_export_done: { en: "Exported {filename} — {notes} note(s)", zh: "已导出 {filename}——{notes} 个音符" },
  arrangement_musicxml_empty: { en: "This track holds no notes, so there is no score to write", zh: "这条轨道没有音符，写不出乐谱" },
  arrangement_hscroll: { en: "Scroll the arrangement sideways", zh: "横向滚动编排" },
  arrangement_tracks_label: { en: "Arrangement tracks", zh: "编排轨道" },
  arrangement_lanes_label: { en: "Arrangement lanes", zh: "编排通道" },
  lanes_label: { en: "Lanes", zh: "通道" },
  arrangement_header_column: { en: "Track headers", zh: "轨道头" },
  track_header_label: { en: "{name} track header", zh: "{name} 轨道头" },
  track_volume_label: { en: "{name} volume", zh: "{name} 音量" },
  track_arm_label: { en: "Record-arm {name}", zh: "给 {name} 待录" },
  track_mute_label: { en: "Mute {name}", zh: "静音 {name}" },
  track_solo_label: { en: "Solo {name}", zh: "独奏 {name}" },
  track_remove_label: { en: "Remove {name}", zh: "删除 {name}" },
  track_msr_label: { en: "Mute, solo and record-arm for {name}", zh: "{name} 的静音、独奏与待录" },
  track_add_label: { en: "Add a track", zh: "添加轨道" },
  /*
    The region's name carries its **bar range**, not only its length — the same shape `loop_start_label` uses, and for
    the same reason: the arrow keys change where the region sits, and an accessible name that did not say so would make
    the keyboard alternative (WCAG 2.5.7) invisible to the person using it.
  */
  region_label: { en: "{name}, bars {from} to {to}", zh: "{name}，第 {from} 到 {to} 小节" },
  region_resize_label: { en: "Change how long {name} is", zh: "改变 {name} 的长度" },
  region_empty: { en: "no notes", zh: "没有音符" },
  // The playhead and the play-start are two indicators, which is Bitwig's documented model: a moving line for where
  // playback is, and a triangle for where a play will begin.
  playhead_label: { en: "Playhead", zh: "播放头" },
  play_start_label: { en: "Play start", zh: "播放起点" },
  loop_start_label: { en: "Loop start, bars {from} to {to}", zh: "循环起点，第 {from} 到 {to} 小节" },
  loop_end_label: { en: "Loop end, bars {from} to {to}", zh: "循环终点，第 {from} 到 {to} 小节" },
  loop_move_label: { en: "Move the loop, bars {from} to {to}", zh: "移动循环，第 {from} 到 {to} 小节" },
  bar_previous: { en: "Previous bar", zh: "上一小节" },
  bar_next: { en: "Next bar", zh: "下一小节" },
  roll_bars_unit: { en: "bars", zh: "小节" },
  roll_add_bar: { en: "Add a bar", zh: "加一小节" },
  roll_remove_bar: { en: "Remove a bar", zh: "减一小节" },
  score_hint: { en: "The same notes, written to be read", zh: "同一批音符，按能读的样子写出来" },
  view_piano_roll: { en: "Piano Roll", zh: "钢琴卷帘" },
  view_score: { en: "Score", zh: "谱面" },
  roll_hint: { en: "Click a cell to write a note, click a note to remove it", zh: "点空格写音符，点音符删除" },
  roll_length: { en: "Length (beats)", zh: "长度（拍）" },
  roll_resize_note: { en: "Change how long {note} is held", zh: "改变 {note} 的长度" },
  roll_add_note: { en: "Add a note at {note}", zh: "在 {note} 写一个音" },
  roll_remove_note: { en: "Remove the note at {note}", zh: "删除 {note} 上的音" },
  instrument_search: { en: "Search instruments", zh: "搜索乐器" },
  instrument_all: { en: "All", zh: "全部" },
  instrument_uncategorised: { en: "Uncategorised", zh: "未分类" },
  instrument_choose: { en: "Choose an instrument", zh: "选择乐器" },
  instrument_current: { en: "Instrument", zh: "乐器" },
  keyboard_hint: { en: "Play the selected track with your keyboard, or click the keys", zh: "用电脑键盘或直接点琴键，试听选中的轨道" },
  keyboard_velocity: { en: "Velocity", zh: "力度" },
  keyboard_needs_instrument: { en: "This sampler track needs an instrument before it can sound", zh: "这条采样器轨道还没有选乐器，试听不会有声音" },
  keyboard_needs_sampler: { en: "Select a sampler track to play it", zh: "选中一条采样器轨道才能试听" },
  template_blank_desc: { en: "Blank, with one track already typed the way you choose", zh: "空白，但已经有一条你选好类型的轨道" },
  // The phone shell's navigation vocabulary (`nav_learn`/`nav_tools`/`nav_you`, `mobile_nav_label`,
  // `mobile_unsaved_dot`, `mobile_more_*`, `mobile_action_*`) was deleted with the shell
  // (`docs/OPEN_WORK.md` §十三). Nothing referenced them once `MobileTabBar`/`MobileMoreSheet` were cut.
  nav_chords_desc: { en: "Chord progressions", zh: "和弦走向与进行" },
  nav_console_desc: { en: "Mixer console", zh: "硬件调音台（大屏更好用）" },
  nav_compare_desc: { en: "A/B two genres", zh: "两个曲风 A/B 对比" },
  nav_challenge_desc: { en: "Guess the genre by ear", zh: "听辨曲风挑战" },
  nav_chords: { en: "Chords", zh: "和弦走向" },
  nav_explore: { en: "Explore", zh: "探索" },
  nav_galaxy: { en: "Galaxy", zh: "律动星系" },
  nav_timeline_h: { en: "Timeline H", zh: "水平演变轴" },
  nav_timeline_v: { en: "Timeline V", zh: "垂直时间轴" },
  nav_compare: { en: "Compare", zh: "曲风对比" },
  nav_challenge: { en: "Challenge", zh: "听辨挑战" },
  nav_kick: { en: "Kick Design", zh: "底鼓设计" },
  nav_kick_desc: { en: "The Somatic Triad", zh: "底鼓声学与设计" },
  nav_galaxy_desc: { en: "3D Cosmic Map", zh: "3D 律动星系" },
  nav_timeline_h_desc: { en: "Chronology", zh: "年代编年演变轴" },
  nav_timeline_v_desc: { en: "Storylines", zh: "流派故事脉络" },
  nav_masterclass: { en: "Rhythm & Grooves", zh: "节奏律动" },
  nav_masterclass_desc: { en: "Polyrhythm & Groove Lab", zh: "复节奏对撞与微时序律动实验室" },
  nav_analyzer: { en: "Analyzer & Scope", zh: "全景示波器" },
  nav_analyzer_desc: { en: "FFT & Phase Scope", zh: "全景声谱与李萨如图" },

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
  error_studio_title: { en: "Studio View Error", zh: "工作台运行异常" },
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
  shortcuts_guide_title: { en: "Keyboard shortcuts", zh: "键盘快捷键" },
  header_updates_btn: { en: "Updates & Changelog", zh: "检查更新 & 更新记录" },
  footer_check_updates: { en: "Check updates & changelog", zh: "检查更新与版本记录" },
  footer_updates_btn: { en: "Updates", zh: "更新记录" },
  footer_genres_tag: { en: "159 Synthetic Genres & Realtime Audio Synthesis", zh: "159 种电子与现代曲风合成器原生仿真" },
  footer_open_source: { en: "Dual Audio Synthesis Engine · Web Audio API & Tone Generation", zh: "双音频合成引擎驱动 · Web Audio 原生实时发声" },

  // Shortcuts guide (U-11)
  shortcut_nav_studio: { en: "Go to Studio", zh: "跳转至 工作台" },
  shortcut_nav_chords: { en: "Go to Chords", zh: "跳转至 和弦走向" },
  shortcut_nav_galaxy: { en: "Go to Galaxy", zh: "跳转至 律动星系" },
  shortcut_nav_timeline: { en: "Go to Timeline", zh: "跳转至 水平时间线" },
  shortcut_nav_story: { en: "Go to Story", zh: "跳转至 垂直时间轴" },
  shortcut_nav_compare: { en: "Go to Compare", zh: "跳转至 曲风对比" },
  shortcut_nav_challenge: { en: "Go to Challenge", zh: "跳转至 听音挑战" },
  shortcut_nav_masterclasses: { en: "Go to Rhythm & Grooves", zh: "跳转至 节奏律动" },
  shortcut_nav_analyzer: { en: "Go to Analyzer & Scope", zh: "跳转至 声谱示波器" },
  shortcut_nav_kick: { en: "Go to Kick Design", zh: "跳转至 底鼓设计" },
  shortcut_nav_search: { en: "Open Global Search", zh: "打开全局搜索" },
  shortcut_nav_panel: { en: "Show Keyboard Shortcuts", zh: "打开此快捷键面板" },
  shortcut_nav_close: { en: "Close Dialog / Drawer", zh: "关闭当前弹窗 / 抽屉" },
  shortcut_studio_play_pause: { en: "Play / Pause playback", zh: "播放 / 暂停" },
  shortcut_studio_drums_only: { en: "Toggle Drums Only mode", zh: "只听鼓组快捷切换 (Drums Only)" },
  shortcut_studio_scope: { en: "Toggle Panoramic Analyzer & Scope", zh: "开闭全景声谱示波器 (Scope)" },
  shortcut_studio_undo: { en: "Undo pattern change", zh: "撤销步进修改" },
  shortcut_studio_redo: { en: "Redo pattern change", zh: "重做步进修改" },
  shortcut_studio_grid_navigate: { en: "Navigate grid step cells", zh: "音序网格步进键位漫游" },
  shortcut_studio_toggle_step: { en: "Toggle active step", zh: "步进激活与切换" },
  shortcut_studio_jump_edges: { en: "Jump to first / last step", zh: "跳转至行首 / 行尾" },
  shortcut_studio_velocity: { en: "Toggle Velocity lane", zh: "开闭力度抽屉 (Velocity)" },
  shortcut_studio_euclidean: { en: "Open Euclidean generator", zh: "打开欧几里得律动器" },
  shortcut_studio_musical_typing: { en: "Toggle Musical Typing keyboard", zh: "开闭电脑音乐键盘演奏 (Musical Typing)" },
  shortcut_modal_title: { en: "Keyboard Shortcuts Guide", zh: "键盘快捷键指南" },
  shortcut_section_navigation: { en: "Global Navigation (Press g followed by key)", zh: "全局导航快捷键 (按 g 后快速按字母)" },
  shortcut_section_studio: { en: "Studio Sequencer Shortcuts", zh: "工作台音序器快捷键" },
  /**
   * Shown where the sequencer's key listener is not mounted. It says where the keys do work and **names none of
   * them**, because naming one here is exactly the promise the old list could not keep.
   */
  shortcut_studio_scope_note: {
    en: "Sequencer keys (Space, undo/redo, grid navigation) are active on the Studio route only.",
    zh: "音序器键位（空格、撤销 / 重做、网格漫游）只在工作台（Studio）路由上有效。",
  },
  /**
   * The arrangement's own section. It exists because the new-project route now has a history and a listener of its
   * own — Ctrl+Z was previously hidden there *because it truly did nothing*, and a reference that keeps printing
   * nothing after the key starts working is the same defect from the other side.
   */
  shortcut_section_arrangement: { en: "Arrangement Editor Shortcuts", zh: "新编排编辑器快捷键" },
  shortcut_arrangement_undo: { en: "Undo arrangement edit", zh: "撤销编排修改" },
  shortcut_arrangement_redo: { en: "Redo arrangement edit", zh: "重做编排修改" },
  shortcut_arrangement_redo_alias: { en: "Redo arrangement edit (alias)", zh: "重做编排修改（同义键）" },
  shortcut_arrangement_scope_note: {
    en: "Arrangement keys (undo/redo of arrangement edits) are active on the New Project route only.",
    zh: "编排键位（撤销 / 重做编排修改）只在新编排（New Project）路由上有效。",
  },

  // Challenge Certificate Modal (shared global modal)
  cert_share_text: { en: "🎧 My Groove Ear Training Rank is [{tier}] ({elo} ELO)!\n🎯 Accuracy: {accuracy}% | ⚡ Best Streak: {streak} | 🧠 Mastered Genres: {mastered}\nChallenge your acoustic perception at: https://groove.wangda.today", zh: "🎧 我的 Groove 音乐盲听听力天梯已达到【{tier}】({elo} ELO)！\n🎯 正确率: {accuracy}% | ⚡ 最高连胜: {streak} 局 | 🧠 攻克曲风: {mastered} 种\n快来挑战你的声学辨识力：https://groove.wangda.today" },
  cert_close_aria: { en: "Close Certificate", zh: "关闭证书" },
  cert_title: { en: "Ear Acumen Rank Certificate", zh: "听力大师声学段位认证" },
  cert_subtitle: { en: "Official Certification of Acoustic Perception", zh: "音乐感知与风格辨识官方评级体系" },
  cert_current_tier: { en: "Current Rank Tier", zh: "当前天梯段位" },
  cert_accuracy: { en: "Accuracy", zh: "命中率" },
  cert_best_streak: { en: "Best Streak", zh: "最佳连胜" },
  cert_answered: { en: "Answered", zh: "总辨识" },
  cert_issued: { en: "Issued: ", zh: "评定日期: " },
  cert_copied: { en: "Copied to clipboard!", zh: "已复制战报到剪贴板！" },
  cert_copy: { en: "Copy Shareable Text", zh: "复制段位证书战报" },
  cert_close: { en: "Close", zh: "关闭" },
} as const;
