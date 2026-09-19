# TIMBRE_NOTES — genre 乐器音色接线与策展

本文件记录两条相互衔接的工作：

1. `feat/genre-timbres`：引擎此前忽略数据里的 `track.instrument`，只按 track **角色**
   播固定预设；现在实时引擎与离线 WAV 渲染器都走
   `src/audio/instrumentPresets.ts` 的 `resolveInstrumentPreset()`。
2. `feat/genre-instrument-curation`（本分支）：引擎已经会读数据，但数据本身不是
   「本曲风的本命音色」——159 个 genre 的 `instrumentation` 是同一份字面量，fx 全是
   `noise_sweep`，92/159 的主音是 `saw_lead`。本次按每个 genre 自己的
   `sound_design` / `cultural_context` / `rhythm_features` / `bass_pattern` / 艺人
   重新策展 `lead` / `fx`（必要时 `chords` / `bass`）与 `instrumentation` 文本，并给
   新用到的乐器补上真实合成参数的预设。

---

## 1. 修的缺陷

| # | 缺陷 | 现状 |
|---|---|---|
| 1 | 引擎忽略 `track.instrument`，按角色播固定预设 | 已修：`resolveInstrumentPreset(instrument, trackId)` |
| 2 | `instrumentation` 159 个 genre 完全相同（`Synthesizer/Drum Machine/Bass/Sampler/FX`），且用户可见（`GenreDetailView`「核心配器」、`CompareView`「典型配器与音色设计」、`HorizontalTimelineView` hover tooltip） | 已修：159 份互不相同的策展清单（最长 6 项、最短 2 项） |
| 3 | fx 159/159 是 `noise_sweep`（一条合成 riser 覆盖整库，包括原声/传统曲风） | 已修：9 种 fx，最大占比 54/159 |
| 4 | 主音 `saw_lead` 92/159，包括 `traditional-jazz`/`bebop`/`hard-bop`/`cool-jazz`/`modal-jazz`/`free-jazz`/`acid-jazz` 等铜管/键盘曲风 | 已修：27 种主音，`saw_lead` 降到 28/159 |
| 5 | 声明的乐器无法被发声（库里没有 sax/organ/piano/vibraphone…） | 已修：新增 30 个真实预设 + alias |

变更量（相对基线 `535dd0f`）：

| 轨 | 改动 genre 数 |
|---|---|
| `lead` | 89 / 159 |
| `fx` | 105 / 159 |
| `bass` | 51 / 159 |
| `chords` | 19 / 159 |

全部改动只有 `instrument` 与 `instrumentation` 两类字段；
`steps` / `velocity` / `pitch` / `gate` / `ratchet` / `probability` / BPM / 拍号 /
`totalSteps` 一行未动（`scratch/verify_diff.mjs` 逐字段比对过）。

---

## 2. 预设库

预设字段：`osc1Type/osc2Type, osc2DetuneCents, osc2Mix`；`filterCutoff/Q`；
`adsr = attack/decay/sustain/release`（秒，sustain 为 0–1）。所有预设都是
`PolySynth.ts` 的 `DEFAULT_SYNTH_PRESETS` 键，实时与离线共用同一个
`playPolySynthNote()`，因此导出与新引擎天然 bit-for-bit 一致。

### 2.1 原有预设（数值未动）

`analogLead`(Analog Lead)、`warmPad`(Warm Poly Pad)、`deepPluck`(Deep Pluck)、
`acidBass`(Acid 303 Bass) 四个 legacy 键保留；`sawLead`、`squareLead`、`guitarLead`、
`fluteLead`、`pluckSynth`、`supersaw`、`rhodesEp`、`m1Organ`、`brassSynth`、`subBass`、
`bass808`、`reeseBass`、`walkingUpright`、`slapBass`、`distortedKickBass`、`noiseSweep`
为数据驱动的音色（详见上一版记录，此处不重复）。

### 2.2 本次新增的 30 个预设

新增两个**可选**合成参数（只在需要时启用，其余预设行为与成本不变）：

- `noiseMix`（0–1）：把白噪声混入该 voice 的共振低通。噪声由确定性 LCG 生成并按
  `AudioContext` 缓存（`sharedNoiseBuffer()`），因此实时与离线渲染的噪声完全一致。
- `pitchSweepCents`：音符结束时到达的音高偏移（cents）。振荡器从本音指数滑到
  `freq·2^(cents/1200)`：负值 = tape-stop / laser / sub-drop 下坠，正值 = riser。
  目标频率经 `safeFreq` 夹取，绝不会给 `exponentialRampToValueAtTime` 传非正数。

| instrument | 预设键 | 振荡器 | 滤波器 | ADSR | 设计要点 |
|---|---|---|---|---|---|
| `finger_bass` | `fingerBass` | triangle/saw, 4c, .22 | 900/Q1.6 | .008/.45/.32/.22 | 指弹电贝斯：木质、有拨弦衰减 |
| `pick_bass` | `pickBass` | saw/square, 3c, .30 | 1400/Q2.6 | .003/.30/.38/.16 | 拨片电贝斯：保留拨片瞬态，摇滚/金属 |
| `analog_bass` | `analogBass` | saw/square, 6c, .35 | 700/Q3.2 | .006/.28/.50/.18 | Minimoog 式合成贝斯，持续音 |
| `sax_lead` | `saxLead` | saw/square, 7c, .32 | 2900/Q2.0 | .035/.22/.82/.26 | 簧片体 + 吐音起音 + 中频共振 |
| `trumpet_lead` | `trumpetLead` | saw/square, 10c, .38 | 4000/Q2.2 | .045/.18/.78/.22 | 更亮更辉煌，唇振起音略长 |
| `muted_trumpet` | `mutedTrumpet` | square/saw, 5c, .28 | 1900/Q4.0 | .03/.20/.75/.20 | Harmon 弱音器：方波主导、窄带高 Q |
| `brass_section` | `brassSection` | saw/saw, 16c, .50 | 3200/Q1.8 | .04/.24/.80/.24 | 群奏铜管：失谐更宽、起音略慢 |
| `piano_lead` | `pianoLead` | saw/sine, 3c, .24 | 4400/Q1.0 | .002/1.2/.12/.40 | 钢琴：硬击弦瞬态 + 长衰减，亮于 Rhodes |
| `organ_lead` | `organLead` | square/sine, 0c, .45 | 6200/Q0.6 | .004/.12/.94/.12 | Hammond B3：零拍频、瞬时起音、全持续 |
| `vibraphone` | `vibraphone` | sine/triangle, 2c, .30 | 5000/Q1.3 | .002/1.6/.05/.80 | 金属棒长衰减，几乎无持续 |
| `strings_lead` | `stringsLead` | saw/saw, 18c, .50 | 3400/Q0.8 | .35/.40/.90/.90 | 弓弦群：350 ms 慢起音 + 长释放 |
| `pluck_string` | `pluckString` | triangle/saw, 6c, .24 | 2400/Q3.0 | .002/.50/.05/.28 | 尼龙/拨弦，木质快衰减 |
| `pan_flute` | `panFlute` | sine/triangle, 5c, .22 | 3000/Q0.7 | .06/.16/.85/.28 | 排箫：16% 气声噪声 |
| `sitar_lead` | `sitarLead` | saw/square, 22c, .42 | 3800/Q5.0 | .002/.90/.18/.50 | jawari 嗡鸣：宽失谐 + 高 Q |
| `accordion_lead` | `accordionLead` | square/saw, 14c, .40 | 3400/Q1.6 | .03/.15/.85/.18 | 缪塞特簧片：14c 拍频、近全持续 |
| `harmonica_lead` | `harmonicaLead` | square/triangle, 4c, .26 | 3200/Q3.4 | .02/.25/.60/.20 | 蓝调口琴：簧片咬合 + 10% 吹气噪声 |
| `marimba_lead` | `marimbaLead` | sine/triangle, 0c, .20 | 2600/Q1.6 | .001/.55/0/.35 | 木琴：1 ms 起音、零持续 |
| `bell_lead` | `bellLead` | sine/sine, 1900c, .40 | 6000/Q1.0 | .001/1.8/0/1.2 | 非谐波钟/八音盒 |
| `sine_lead` | `sineLead` | sine/saw, 0c, .18 | 4200/Q1.1 | .012/.30/.72/.30 | G-funk 滑音主音（-80c 缓降） |
| `fm_lead` | `fmLead` | sine/square, 1207c, .45 | 5200/Q3.0 | .002/.22/.35/.14 | FM squelch（非谐波分音） |
| `cowbell_lead` | `cowbellLead` | square/square, 540c, .50 | 5000/Q6.0 | .001/.28/.04/.12 | TR-808 牛铃当旋律钩子 |
| `growl_lead` | `growlLead` | square/saw, 40c, .55 | 1500/Q8.0 | .008/.40/.60/.20 | Dubstep/neuro wavetable growl |
| `horn_stab` | `hornStab` | saw/saw, 20c, .48 | 3000/Q3.0 | .012/.26/.10/.20 | 铜管齐奏一记 |
| `vinyl_crackle` | `vinylCrackle` | （振荡器静音） | 7000/Q0.8 | .004/.12/.35/.50 | `noiseMix .9`：唱片/磁带底噪 |
| `tape_stop` | `tapeStop` | saw/square, 8c, .30 | 3000/Q2.0 | .002/.50/.30/.20 | `pitchSweepCents -2400`：唱盘/磁带停转 |
| `reverse_cymbal` | `reverseCymbal` | （振荡器静音） | 9000/Q0.7 | .50/.05/.90/.02 | `noiseMix 1`：0.5 s 反向镲 |
| `noise_rise` | `noiseRise` | （振荡器静音） | 4000/Q1.0 | 1.1/.10/.95/.05 | `noiseMix 1` + `+700c`：白噪 riser |
| `sweep_down` | `sweepDown` | saw/sine, 0c, .15 | 5200/Q1.2 | .005/.80/.20/.30 | `noiseMix .5` + `-1200c`：下滑扫频 |
| `sub_drop` | `subDrop` | sine/triangle, 0c, .10 | 300/Q1.0 | .004/1.0/.30/.60 | `-1200c`：808 sub 下坠 |
| `laser_zap` | `laserZap` | square/saw, 12c, .30 | 6000/Q4.0 | .001/.12/0/.08 | `-1900c`：0.12 s 激光 zap |

`noise_sweep`（`noiseSweep`）仍然走实时 `AudioEngine.playFX` 与离线
`WavExporter.synthFX` 共用的专用锯齿→带通下扫路径：只要解析结果**等于**
`DEFAULT_SYNTH_PRESETS.noiseSweep` 就走老路径，其余 fx 预设才进复音合成器。
`audioScheduler.test.ts` / `wavMixerParity.test.ts` 对该分支的断言保持通过。

### 2.3 鼓轨（kick / snare / hihat / percussion）——不使用预设

鼓组仍走 `DrumKitModels` 专用合成，`triggerInstrument` 的鼓分支先于合成器分支；
`TRACK_ROLE_DEFAULT_PRESET_KEYS` 里的 kick/snare/hihat/percussion 默认值只是让解析器
对数据里的全部 `track_id` 全域可解析。**本次没有改动任何鼓轨 instrument。**

### 2.4 别名表（`INSTRUMENT_PRESET_ALIASES`）

除原有条目外，新增：

- 策展名字：`finger_bass`/`pick_bass`/`analog_bass`、`sax_lead`/`trumpet_lead`/
  `muted_trumpet`/`brass_section`/`piano_lead`/`organ_lead`/`vibraphone`/
  `strings_lead`/`pluck_string`/`pan_flute`/`sitar_lead`/`accordion_lead`/
  `harmonica_lead`/`marimba_lead`/`bell_lead`/`sine_lead`/`fm_lead`/`cowbell_lead`/
  `growl_lead`、`horn_stab`/`vinyl_crackle`/`tape_stop`/`reverse_cymbal`/
  `noise_rise`/`sweep_down`/`sub_drop`/`laser_zap`
- 同义词：`saxophone`、`trumpet`/`cornet`、`horn`/`horn_section`、`piano`/
  `acoustic_piano`/`grand_piano`、`hammond`/`hammond_organ`、`strings`/
  `string_section`、`vibes`、`electric_bass`/`fingerstyle_bass`/`precision`…、
  `picked_bass`、`moog_bass`/`synth_bass`、`melodica`→`harmonicaLead`、
  `music_box`/`bells`、`growl`、`vinyl`/`crackle`、`tape`、`down_sweep`、
  `drop`、`laser`/`zap`、`stab`

---

## 3. 回退链（未削弱）

`resolveInstrumentPreset(instrument, trackId)` 纯函数，命中即返回，永不抛错：

1. **精确预设键**（忽略大小写）：如 `"supersaw"`、`"warmPad"`。
2. **别名表**：`normalizeInstrumentName` 折叠空白/连字符，`"Saw Lead"`、`"FLUTE-LEAD"`
   都能命中。
3. **track 角色默认**：`bass→acidBass`、`chords/pad→warmPad`、`lead→analogLead`、
   `fx→noiseSweep`；鼓角色默认仅用于全域可解析。
4. **全局默认**：`analogLead`（`GLOBAL_DEFAULT_PRESET_KEY`）。

本次只**新增** alias，四级顺序与 role 默认值一字未改。

---

## 4. 策展映射与依据

原则：只依据该 genre 自己的 `sound_design` / `cultural_context` / `rhythm_features` /
`bass_pattern` / `production_tips` / `representative_artists`。159 个 genre 的
`sound_design.en` 本来就互不相同，是最主要的依据来源。所有 159 个 genre 的
`instrument` 都只改「角色允许改」的四条轨。

### 4.1 Jazz/Blues（14）

| genre | lead | chords | bass | fx | 依据 |
|---|---|---|---|---|---|
| delta-blues | guitar_lead（保留） | guitar_lead | walking_upright | vinyl_crackle | sound：原声滑棒吉他；1900 年代虫胶唱片底噪 |
| chicago-blues | **harmonica_lead** | guitar_lead | **walking_upright** | vinyl_crackle | sound 第一条即 amplified distorted harmonica；50s 单曲 |
| texas-blues | guitar_lead | guitar_lead | **finger_bass** | **horn_stab** | cultural_context 明写 brass horn sections |
| electric-blues | guitar_lead | **guitar_lead** | **finger_bass** | horn_stab | sound：ES-335、warm brass sections；原文无键盘 |
| traditional-jazz | **trumpet_lead** | guitar_lead | walking_upright | horn_stab | sound：cornet/trumpet/trombone/clarinet/banjo |
| bebop | **sax_lead** | **piano_lead** | walking_upright | horn_stab | sound：alto sax、bebop acoustic piano |
| hard-bop | **sax_lead** | **piano_lead** | walking_upright | horn_stab | sound：tenor sax、blues-drenched piano chords |
| cool-jazz | **muted_trumpet** | **vibraphone** | walking_upright | vinyl_crackle | sound：harmon-muted trumpet、cool vibraphone |
| modal-jazz | **trumpet_lead** | **piano_lead** | walking_upright | vinyl_crackle | sound：open acoustic trumpet、quartal piano voicings |
| free-jazz | **sax_lead** | **piano_lead** | walking_upright | vinyl_crackle | sound：overblown saxophones、percussive piano clusters |
| jazz-fusion | saw_lead（保留） | rhodes_ep | **finger_bass** | noise_sweep（保留） | sound：Minimoog（saw 主音合理）、Rhodes、Jaco fretless bass（非 slap） |
| smooth-jazz | **sax_lead** | rhodes_ep | **finger_bass** | **noise_rise** | sound：Soprano saxophone、DX7 EP、electric bass；Kenny G/Grover |
| acid-jazz | **brass_section** | guitar_lead | slap_bass | horn_stab | sound：live brass horn stabs、wah-wah funk guitar、slap bass |
| gypsy-jazz | guitar_lead | guitar_lead | walking_upright | vinyl_crackle | Django/Grappelli：Selmer 吉他 + La Pompe 节奏 |

### 4.2 Latin/World（11）

| genre | lead | chords | bass | fx | 依据 |
|---|---|---|---|---|---|
| salsa | **trumpet_lead** | **piano_lead** | walking_upright | horn_stab | sound：piano montuno、bright trumpet section |
| bachata | guitar_lead | guitar_lead | **finger_bass** | vinyl_crackle | sound：Requinto 吉他、electric bass |
| reggae | **brass_section** | m1_organ | **finger_bass** | tape_stop | sound：Hammond organ bubble、heavy flatwound electric bass；sound-system rewind |
| dancehall | **square_lead** | rhodes_ep | sub_bass | tape_stop | sound：Casio/Yamaha digital synths（Sleng Teng）；rewind |
| reggaeton | **brass_synth** | rhodes_ep | **808_bass** | **sub_drop** | sound：synth brass、deep 808 sub-bass |
| afrobeat | **brass_section** | rhodes_ep | **finger_bass** | horn_stab | sound：big-band brass horns、electric piano；Fela 的低音是指弹 |
| amapiano | **piano_lead** | rhodes_ep | **808_bass** | noise_sweep（保留） | sound：log drum（有音高的 808）、jazz piano/Rhodes |
| bossa-nova | flute_lead（保留） | guitar_lead | walking_upright | vinyl_crackle | sound：nylon guitar、warm flute/sax |
| samba | flute_lead（保留） | guitar_lead | walking_upright | vinyl_crackle | sound：cavaquinho、surdo/cuíca/pandeiro |
| cumbia | **accordion_lead** | **accordion_lead** | **finger_bass** | horn_stab | sound：button accordion、acoustic electric bass |
| kuduro | saw_lead（保留） | warm_pad | sub_bass | noise_sweep（保留） | sound：punchy kicks、electronic whistle blasts、sub-bass |

### 4.3 Rock/Metal（17）

- **贝斯是本批最大的错误**：数据写的是 picked / plectrum / downpicked / distorted
  electric bass，此前播 `sub_bass` 正弦。除 `rock-and-roll`（upright acoustic bass）
  外 16 个全部改为 `pick_bass`。
- `lead`/`chords` 的 `guitar_lead` 本就正确（数据全是 cranked/overdriven/DS-1/HM-2
  吉他），保持不动——这是「已正确、不要改」的分布。
- `progressive-rock` chords `rhodes_ep → m1_organ`（sound：Hammond organs、Mellotron）。
- fx：`reverse_cymbal`（hard-rock/thrash/alternative/math-rock/shoe-gaze——shoegaze
  数据即 reverse reverb）、`noise_rise`（blues-rock/punk/post-punk/death/doom/grunge
  的反馈与噪音墙）、`vinyl_crackle`（black-metal 的 lo-fi cassette hiss）、
  `sub_drop`（metalcore 的 sub-bass drops before breakdowns）、`noise_sweep`
  （new-wave/prog 的合成器扫频）。

### 4.4 Hip Hop（11）

| genre | lead | bass | fx | 依据 |
|---|---|---|---|---|
| old-school-hip-hop | **square_lead** | **finger_bass** | **tape_stop** | sound：TR-808、sampled live funk bass、turntable scratches |
| boom-bap | **brass_section** | walking_upright | **vinyl_crackle** | sound：chopped jazz Rhodes **and horns**、crackling vinyl |
| g-funk | **sine_lead** | **finger_bass** | **horn_stab** | sound：high-pitched sine/saw lead with portamento glide、live electric bass、Parliament 采样 |
| trap-rap | **bell_lead** | 808_bass | noise_sweep | cultural_context：dark minor bells；sound：eerie flutes |
| conscious-hip-hop | **brass_section** | walking_upright | **vinyl_crackle** | sound：live horn sections、Rhodes、upright bass |
| emo-rap | guitar_lead | 808_bass | **reverse_cymbal** | sound：clean plucked guitar loops |
| lofi-hip-hop | pluck_synth | sub_bass | **vinyl_crackle** | sound 第一条：vinyl crackle；muted Rhodes |
| east-coast-hip-hop | **piano_lead** | **finger_bass** | **vinyl_crackle** | sound：dark minor grand piano loops、filtered bass guitar、crackling vinyl |
| west-coast-hip-hop | saw_lead（保留） | **analog_bass** | **vinyl_crackle** | sound：heavy analog synth bass、talkbox；funk 采样 |
| southern-hip-hop | **brass_synth** | 808_bass | **sub_drop** | sound：brass synthesizer blasts；808 sub kicks with pitch drops |
| cloud-rap | **pluck_synth** | 808_bass | **reverse_cymbal** | sound：ethereal synth clouds、reversed female vocal sighs |

### 4.5 Pop/R&B（13）

| genre | lead | chords | bass | fx | 依据 |
|---|---|---|---|---|---|
| traditional-pop | **brass_section** | **strings_lead** | walking_upright | vinyl_crackle | sound：symphonic strings、big band brass、grand piano |
| synth-pop | saw_lead | warm_pad | **analog_bass** | noise_sweep | sound：Juno-60 pads、Minimoog bass |
| disco | **strings_lead** | rhodes_ep | slap_bass | horn_stab | sound：soaring disco strings、orchestral brass、slap bass |
| eurodance | saw_lead | **piano_lead** | **analog_bass** | noise_sweep | sound：Korg M1 piano chords、JP-8000 supersaws、offbeat bass |
| funk | **brass_section** | guitar_lead | slap_bass | horn_stab | sound：brass horn stabs、clavinet、clean rhythm guitar |
| soul | **organ_lead** | m1_organ | **finger_bass** | horn_stab | sound：Hammond B3、real horn section、electric bass |
| neo-soul | pluck_synth | rhodes_ep | **finger_bass** | vinyl_crackle | sound：Fender Rhodes、warm bass guitar；70s soul + hip-hop 底噪 |
| contemporary-rnb | saw_lead | rhodes_ep | 808_bass | noise_sweep | sound：TR-808、digital synth pads |
| alternative-rnb | **pluck_synth** | warm_pad | sub_bass | **reverse_cymbal** | sound：filtered ambient synth pads、murky sub-bass（无吉他） |
| motown | **piano_lead** | **vibraphone** | **finger_bass** | vinyl_crackle | sound：Fender Precision Bass、acoustic piano、vibraphone |
| city-pop | **brass_section** | rhodes_ep | slap_bass | noise_sweep | sound：Roland Rhodes、lush brass horns、slap bass |
| k-pop | saw_lead | supersaw | sub_bass | noise_sweep | sound：modern synthesizer stacks、trap 808s |
| j-pop | **piano_lead** | **strings_lead** | **finger_bass** | noise_sweep | sound：acoustic grand piano runs、strings、distorted guitars |

### 4.6 Electronic（93）

主音只在数据明确指向别的乐器时才离开 `saw_lead`：

- **303 acid**：`acid-house` / `acid-techno` / `hard-trance` / `breakbeat` 主音 →
  `acid_303`（TB-303 / acid squeals）。
- **supersaw**：`uplifting-trance` / `euro-trance` / `happy-hardcore` / `future-bass` /
  `melodic-dubstep` 主音 → `supersaw`（detuned supersaw leads）。
- **FM squelch**：`psytrance` / `bass-house` 主音 → `fm_lead`；`bassline` /
  `speedbass` 贝斯 → `fm_lead`（FM donk / wobble）。
- **growl / reese**：`brostep` / `tearout-dubstep` / `neurofunk` / `hybrid-trap` 主音
  （`tearout` 的贝斯同样）→ `growl_lead`；`brostep` / `neurofunk` / `hybrid-trap` /
  `liquid-dnb` / `riddim` 贝斯 → `reese_bass`。
- **世界音色**：`goa-trance` 主音 → `sitar_lead`（eastern modal melodies、sitar/
  tanpura）；`tropical-house` 主音 → `pan_flute`、chords → `marimba_lead`；
  `frenchcore` 主音 → `accordion_lead`；`dub` 主音 → `harmonica_lead`（melodica）。
- **键盘/钟声**：`trap-rap` / `chicago-drill` / `brooklyn-drill` /
  `kawaii-future-bass` / `idm` 主音 → `bell_lead`；`uk-drill` / `uk-funky` /
  `vocal-trance` / `dream-trance` 主音 → `piano_lead`；`phonk` / `drift-phonk` 主音
  → `cowbell_lead`（TR-808 cowbell leads）。
- **其它**：`hard-techno` / `raw-techno` / `jump-up` / `speed-garage` / `jungle` /
  `ragga-jungle` 主音 → `square_lead`；`techstep` 主音 → `warm_pad`（cold low-passed
  drone pads）；`sambass` 主音 → `pluck_string`、chords → `guitar_lead`；
  `future-garage` / `post-dubstep` / `halftime` / `lofi-house` / `vaporwave` /
  `footwork` / `ambient-dub` 主音 → `pluck_synth`；`downtempo` / `trip-hop` /
  `ambient` / `ambient-techno` 主音 → `strings_lead`。

贝斯：`sub_bass` 只保留在数据确实写 sine/sub 的地方；`post-dubstep`（Moog）、
`synthwave`（Jupiter/Juno）、`west-coast`（analog synth bass）等改 `analog_bass`；
`deathstep` → `pick_bass`（distorted guitar bass）；`hardstyle` → `sub_bass`；
`2-step-garage` reese → `sub_bass`（数据：bouncy sub-bass）。

fx 九种：`noise_sweep`（house/techno/trance/hardcore 等数据里的 white-noise
risers / sweeps）、`vinyl_crackle`（microhouse needle drops、raw-techno tape hiss、
future-garage vinyl crackle、phonk cassette hiss）、`tape_stop`（vaporwave/chillwave/
lofi-house/glitch-hop/breakbeat/dub/ambient-dub 的磁带/唱盘质感）、`laser_zap`
（electro/grime/jump-up/riddim/psytrance/hard-trap/hybrid-trap/kawaii/jersey 的
laser、siren、8-bit blip）、`sub_drop`（drill/dubstep/footwork/halftime 的 808 下坠）、
`noise_rise`、`sweep_down`（speed-garage sirens）、`reverse_cymbal`、`horn_stab`
（big-beat 铜管采样）。

### 4.7 `instrumentation` 字段规则

- 2–6 项，取自该 genre 自己的 `sound_design`/`cultural_context` 里的真实乐器名
  （如 bebop → Alto Sax / Muted Trumpet / Acoustic Piano / Upright Bass / Ride
  Cymbal），不用 track 名。
- 必须与 sequencer 实际发声一致：`bass` / `chords` / `lead` 三条轨声明的乐器都要被
  清单里的某一条命中（允许表见
  `src/test/genreInstrumentation.test.ts` 的 `INSTRUMENT_TOKENS`）。若主音是
  `sax_lead`，清单必须出现「Sax」。
- 不允许单独成项的通用占位词（Synthesizer / Sampler / FX / Bass / Drum Machine）。
- 159 份互不相同（最大共享 1）。

---

## 5. 分布对比（基线 → 现在）

| 轨 | 基线 | 现在 |
|---|---|---|
| `lead` | saw_lead 92、guitar_lead 26、pluck_synth 17、flute_lead 17、square_lead 7（5 种） | **27 种**：saw_lead 28、pluck_synth 24、guitar_lead 24、square_lead 15、piano_lead 8、brass_section 8、strings_lead 5、supersaw 5、bell_lead 5、acid_303 4、growl_lead 4、sax_lead 4、…（含 sitar/pan_flute/accordion/harmonica/cowbell/sine/organ/vibraphone/muted_trumpet） |
| `fx` | noise_sweep 159（1 种） | **9 种**：noise_sweep 54、vinyl_crackle 26、laser_zap 18、noise_rise 14、horn_stab 14、tape_stop 12、sub_drop 11、reverse_cymbal 9、sweep_down 1 |
| `bass` | sub_bass 85、808_bass 19、walking_upright 18、acid_303 10、reese_bass 8、saw_lead 8、slap_bass 8（9 种） | **14 种**：sub_bass 48、808_bass 21、walking_upright 18、pick_bass 16、finger_bass 16、reese_bass 11、acid_303 9、slap_bass 6、analog_bass 6、growl_lead 2、square_lead 2、fm_lead 2、saw_lead 1、distorted_kick 1 |
| `chords` | warm_pad 62、rhodes_ep 49、guitar_lead 25、supersaw 15、m1_organ 4、brass_synth 4（6 种） | **11 种**：warm_pad 61、rhodes_ep 35、guitar_lead 27、supersaw 14、piano_lead 7、m1_organ 5、brass_synth 4、vibraphone 2、strings_lead 2、marimba_lead 1、accordion_lead 1 |
| `instrumentation` | 1 份 ×159 | 159 份，最大共享 1 |

保留不动的音乐学上正确的分布：`walking_upright` 仍是 Jazz/Blues 的主流贝斯、
`slap_bass` 仍在 Pop/R&B 的 funk/disco/city-pop、`808_bass` 仍在 Hip Hop 的
trap/drill、Rock/Metal 的 chords 与 lead 全部保持 `guitar_lead`。

---

## 6. 判断依据与存疑清单（judgement calls）

数据不足或存在多种同样合理的选择时，这里明确列出，不藏在数据里：

1. **chicago-blues 主音选口琴而非吉他**：`sound_design` 第一条是「Amplified
   distorted harmonica through bullet mic」，艺人有 Little Walter；但 Muddy Waters
   的吉他同样可作主音。属两可。
2. **reggae 主音选 `brass_section`**：数据只写 skank 吉他 / organ bubble /
   electric bass / rimshot，主音未点名（历史上是号角、melodica 或人声）。
3. **free-jazz / cool-jazz / modal-jazz / bebop 等 40–60s 录音的 fx 选
   `vinyl_crackle`**：这些曲风本身没有「FX 轨」这一概念，用黑胶/虫胶底噪作为
   一次性质感最不突兀；另一种合理做法是保留噪声扫频。
4. **cumbia chords 用 `accordion_lead`、smooth-jazz 保留 drum machine**：
   数据只点名 accordion/guacharaca/tambor/bass；电钢在现代 cumbia 常见但原始
   数据未提。
5. **vaporwave / future-garage / afro-house / post-dubstep 的主音**：数据描述的是
   采样与氛围（slowed vinyl samples、pitched vocal fragments、organic percussion），
   没有点名主音乐器，选择了最接近的 `pluck_synth`/`strings_lead` 并向 reviewer 声明。
6. **electronic 里仍保留 `saw_lead` 的 28 个**：数据明写 saw/Juno/analog synth
   lead（如 `jazz-fusion` 的 Minimoog、`electro` 的 analog saw synths、
   `chicago-house`），属于「已正确、不该动」。
7. **drill 家族 fx 用 `sub_drop`**：数据写的是 sliding/gliding 808 与 sub
   saturation；把「一次性的 808 下坠」放在 fx 轨是工程判断。
8. **rock/metal 的 fx 用 `reverse_cymbal` / `noise_rise`**：数据没有直接写 FX
   音色，取该类型制作惯例（reverse cymbal 铺垫、反馈噪音渐强）。
9. **`pan_flute` / `marimba_lead` 同时出现在 tropical-house**（lead/chords 各一）：
   数据同时点名 pan flutes 与 wooden marimbas。
10. **`kuduro` / `jungle` 的主音**：数据只写 whistle/chant/siren 与 chopped breaks，
    分别保留 `saw_lead`、改用 `square_lead`（rave stab）属判断。

---

## 7. 反向验证（reverse validation）

`src/test/genreInstrumentation.test.ts` 的每条断言都通过「破坏数据 → 变红 → 恢复」
验证过（`git checkout -- src/data/genres/`）：

| 破坏方式 | 变红的断言 |
|---|---|
| bebop 清单换成旧的 5 项占位词 | placeholder 词汇 + melodic 命名 |
| bebop 清单去掉 Sax | melodic 命名 |
| bebop 清单只剩 1 项 | 2–6 项 + melodic 命名 |
| 全库 fx 改回 `noise_sweep` | fx 不再单一 |
| 全库 lead 改回 `saw_lead` | 主音分布 + melodic 命名 |
| 全库 `instrumentation` 换成同一份字面量 | 清单互不相同 + placeholder + melodic 命名 |
| bebop lead 改成未登记乐器 `theremin_lead` | 显式映射（不落全局默认）+ 词表缺失 |

`instrumentPresets.test.ts` 的「每个 (track_id, instrument) 都能解析且不落到全局
默认」随数据更新后保持通过。

---

## 8. 故意没有动的东西

- **鼓合成与分发**：`playKick`/`playSnare`/`playHiHat`/`playPercussion`、
  `DrumKitModels`、`triggerInstrument` 的鼓分支；鼓轨 instrument 一个未改。
- **`noise_sweep` 专用扫频路径**：`AudioEngine.playFX` / `WavExporter.synthFX`
  的锯齿→带通下扫保持原样；只有解析结果不是 `noiseSweep` 的新 fx 预设才走复音合成器。
- **时序 / swing / gate / ratchet / probability / 效果器机架 / 混音台**：完全未改。
- **pattern 数据**：`steps`/`velocity`/`pitch`/`gate`/`ratchet`/`probability`/
  BPM/拍号/`totalSteps` 一字未动（逐字段比对）。
- **四级回退链与 role 默认值**：未削弱，只新增 alias。
- **原有预设数值**：`analogLead`/`warmPad`/`deepPluck`/`acidBass` 及上一版新增键
  均未改。

---

## 9. 如何验证

```bash
npx tsc --noEmit
npx vitest run                        # 全量
npx eslint 'src/**/*.{ts,tsx}' --quiet
npm run fast
npm run redlines
npm run docs:check
npm run lint:data
npm run data:lint
npm run build && node scripts/check_budgets.js
```

- `genreInstrumentation.test.ts`：配器清单的策展门禁（§7 的 7 条断言）。
- `instrumentPresets.test.ts`：用 `node:fs` 扫描 `src/data/genres/*.ts`，断言
  钉死的 instrument 清单、显式映射覆盖、解析不落全局默认、代表性映射差异。
- `polySynth.test.ts`：断言噪声源 `loop`、pitch sweep 方向与 `safeFreq` 夹取。
- `audioScheduler.test.ts` / `wavMixerParity.test.ts`：断言引擎与离线渲染
  实际创建的振荡器/滤波器等于解析出的预设，且 `noise_sweep` 仍是专用单振荡器扫频。
