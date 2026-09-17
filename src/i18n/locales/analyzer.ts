export const analyzerMessages = {
  analyzer_title: {
    zh: "全景声谱分析仪与李萨如图示波器",
    en: "Panoramic Spectrogram & Lissajous Phase Scope",
  },
  analyzer_subtitle: {
    zh: "高精瀑布流频率谱图（20Hz - 20kHz）与 45° 旋转立体声相位测角仪",
    en: "High-resolution waterfall spectrogram (20Hz - 20kHz) & 45° rotated stereo goniometer",
  },
  analyzer_tab_split: {
    zh: "双联分屏",
    en: "Dual Split",
  },
  analyzer_tab_spectrogram: {
    zh: "瀑布流声谱",
    en: "Waterfall FFT",
  },
  analyzer_tab_lissajous: {
    zh: "李萨如示波器",
    en: "Lissajous Scope",
  },
  analyzer_tab_oscilloscope: {
    zh: "时域双轨波形",
    en: "Waveform Oscilloscope",
  },
  analyzer_freeze: {
    zh: "定格",
    en: "Freeze",
  },
  analyzer_frozen: {
    zh: "定格中",
    en: "Frozen",
  },
  analyzer_peak: {
    zh: "峰值",
    en: "Peak",
  },
  analyzer_correlation: {
    zh: "相位相关系数 (r)",
    en: "Correlation (r)",
  },
  analyzer_width: {
    zh: "立体声宽度",
    en: "Stereo Width",
  },
  analyzer_balance: {
    zh: "左右声道平衡",
    en: "Balance",
  },
  analyzer_status_mono: {
    zh: "稳固单声道兼容",
    en: "Solid Mono Compatibility",
  },
  analyzer_status_wide: {
    zh: "宽广立体声场",
    en: "Wide Stereo Field",
  },
  analyzer_status_anti_phase: {
    zh: "⚠️ 相位抵消风险 (反相)",
    en: "⚠️ Phase Cancellation Risk",
  },
  analyzer_signal_gen_title: {
    zh: "内置声学参考测试信号发生器",
    en: "Acoustic Reference Signal Generator",
  },
  analyzer_open_studio: {
    zh: "进入 Studio 实时母带监测",
    en: "Monitor Studio Output",
  },
  // ---------------------------------------------------------------------------
  // MasterAnalyzerSuite.tsx
  // ---------------------------------------------------------------------------
  analyzer_suite_badge: {
    zh: "全景声谱分析仪",
    en: "PANORAMIC ANALYZER",
  },
  analyzer_suite_split_title: {
    zh: "双重视图 (瀑布流 + 李萨如)",
    en: "Dual Split View",
  },
  analyzer_suite_split: {
    zh: "双联分屏",
    en: "Split",
  },
  analyzer_suite_spectrogram_title: {
    zh: "高精瀑布流频谱图",
    en: "Waterfall Spectrogram",
  },
  analyzer_suite_spectrogram: {
    zh: "瀑布谱",
    en: "FFT",
  },
  analyzer_suite_lissajous_title: {
    zh: "李萨如图立体声示波器",
    en: "Lissajous Phase Scope",
  },
  analyzer_suite_lissajous: {
    zh: "李萨如",
    en: "Phase",
  },
  analyzer_suite_oscilloscope_title: {
    zh: "双轨时域波形示波器",
    en: "Waveform Oscilloscope",
  },
  analyzer_suite_oscilloscope: {
    zh: "波形",
    en: "Wave",
  },
  analyzer_suite_freeze_title: {
    zh: "冻结当前瞬态波形进行定格分析",
    en: "Freeze Frame for forensic inspection",
  },
  analyzer_suite_peak_title: {
    zh: "显示音轨峰值驻留点",
    en: "Toggle peak hold points",
  },
  analyzer_suite_restore: {
    zh: "恢复窗口",
    en: "Restore",
  },
  analyzer_suite_maximize: {
    zh: "全屏沉浸",
    en: "Maximize",
  },
  analyzer_suite_close_title: {
    zh: "关闭分析仪",
    en: "Close",
  },
  analyzer_suite_signal_label: {
    zh: "信号发生器",
    en: "Signal Gen",
  },
  analyzer_suite_signal_toggle: {
    zh: "信号发生器开关",
    en: "Signal generator power",
  },
  analyzer_suite_signal_toggle_title: {
    zh: "启用后从右侧下拉框选择内置声学参考信号并立即试听",
    en: "Enable, then pick a built-in acoustic reference signal to audition it",
  },
  analyzer_suite_signal_select: {
    zh: "内置声学参考信号",
    en: "Built-in reference signal",
  },
  // ---------------------------------------------------------------------------
  // AnalyzerView.tsx
  // ---------------------------------------------------------------------------
  analyzer_badge_workstation: {
    zh: "声学分析工作台",
    en: "ACOUSTIC WORKSTATION",
  },
  analyzer_monitoring_studio: {
    zh: "正在监测 Studio 音序器输出",
    en: "Monitoring Studio Output",
  },
  analyzer_page_desc: {
    zh: "提供 60fps 实时对数瀑布流频率谱图（20Hz - 20kHz）与 45° 旋转立体声李萨如测角仪。支持实时相位相关系数（r）监测、单声道兼容性警报与内置声学参考信号发生器。",
    en: "High-precision 60fps logarithmic waterfall spectrogram (20Hz - 20kHz) & 45° rotated Lissajous goniometer. Real-time phase correlation (r) detection, mono compatibility alerts, and built-in acoustic test signals.",
  },
  analyzer_open_studio_monitor: {
    zh: "进入 Studio 实时监测",
    en: "Open Studio Monitor",
  },
  analyzer_signal_gen_heading: {
    zh: "内置声学参考测试信号发生器",
    en: "Acoustic Test Signal Generator",
  },
  analyzer_signal_gen_hint: {
    zh: "(点击立即试听并观察声学响应)",
    en: "(Click to audition & observe)",
  },
  analyzer_stop_signal: {
    zh: "停止发声",
    en: "Mute Signal",
  },
  analyzer_observation_label: {
    zh: "观测预期:",
    en: "Observation:",
  },
  analyzer_card_fft_title: {
    zh: "傅里叶变换与对数瀑布流 (FFT Mechanics)",
    en: "Fourier Transform & FFT Mechanics",
  },
  analyzer_card_fft_desc: {
    zh: "快速傅里叶变换 (FFT) 将时域连续振动信号离散化为 1024 个频段的能量切片。人耳耳蜗基底膜感知音高呈对数尺度分布（每跨越一个八度频宽翻倍），因此分析仪采用 20Hz - 20,000Hz 对数横轴，完美匹配音乐音阶分布。",
    en: "Fast Fourier Transform (FFT) decomposes time-domain signals into discrete frequency bins. Because human cochlear hearing perceives pitch logarithmically (frequency doubles per octave), our analyzer maps 20Hz - 20,000Hz on a logarithmic scale matching musical intervals.",
  },
  analyzer_card_lissajous_title: {
    zh: "李萨如图与 45° 旋转测角仪 (Lissajous & Phase Scope)",
    en: "Lissajous & 45° Goniometer",
  },
  analyzer_card_lissajous_desc: {
    zh: "经典立体声测角仪通过 45° 坐标旋转，将左声道 (L) 与右声道 (R) 转化为中置单声道 (Mid = L+R) 与侧向差分 (Side = L-R)。纯单声道信号在垂直 Y 轴呈现紧致细线，宽广立体声展开为椭圆云团，极端反相呈现水平展开。",
    en: "Standard audio goniometers apply a 45° rotation to decompose L and R into Mid (L+R) and Side (L-R). Mono signals form a razor-sharp vertical spine on the Y axis, balanced stereo forms an upright elliptical cloud, and anti-phase expands horizontally.",
  },
  analyzer_card_phase_title: {
    zh: "相位相关系数 (r) 与梳状滤波 (Comb Filtering)",
    en: "Phase Correlation (r) & Comb Filtering",
  },
  analyzer_card_phase_desc: {
    zh: "皮尔逊相位相关系数 r 范围在 -1.0 到 +1.0 之间。当 r > +0.5 时混音具有出色的单声道兼容性。如果 r < 0，左右声道相位冲突，在夜店单声道超重低音炮或手机单扬声器播放时，低频声波将相互抵消消失！",
    en: "Pearson phase correlation r ranges from -1.0 to +1.0. When r > +0.5, mono compatibility is rock solid. When r < 0, anti-phase cancellation causes basslines and drums to completely vanish on club mono subwoofers and mobile phone speakers!",
  },
  analyzer_card_bands_title: {
    zh: "混音黄金七频段法则 (The 7 Acoustic Bands)",
    en: "The 7 Acoustic Frequency Bands",
  },
  analyzer_card_bands_desc: {
    zh: "底鼓与 808 避开 60Hz 频点对冲；军鼓箱体稳固在 200-250Hz；踩镲与扫频混响延伸至 10kHz+ 展现细腻的高频空气感。",
    en: "Kick and 808 carve out space around 60Hz; snare body anchors at 200-250Hz; hi-hats and air sheens shimmer at 10kHz+.",
  },
};
