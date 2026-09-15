# TIMBRE_NOTES — genre 乐器音色接线（`track.instrument`）

本文件记录 `feat/genre-timbres` 分支的音色映射：数据里的 `track.instrument` 如何
落到 `PolySynth` 预设、回退链、以及刻意没有动的东西。

## 1. 修的缺陷

159 个 genre 的每条 track 都在数据里声明了 `instrument`，但引擎此前完全忽略它，
只按 track **角色**播固定预设：

| 角色 | 旧行为（硬编码） |
|---|---|
| bass | `DEFAULT_SYNTH_PRESETS.acidBass` |
| chords | `DEFAULT_SYNTH_PRESETS.warmPad` |
| lead | `DEFAULT_SYNTH_PRESETS.analogLead` |
| fx | 独立的锯齿扫频（`playFX` / `synthFX`） |

于是 `flute_lead` 的曲子听起来是模拟锯齿主音。现在实时引擎与离线 WAV 渲染器都
通过 `src/audio/instrumentPresets.ts` 的 `resolveInstrumentPreset()` 解析预设。

## 2. 完整 instrument → preset 表

预设字段顺序：`osc1Type/osc2Type, osc2DetuneCents, osc2Mix`；`filterCutoff/Q`；
`adsr = attack/decay/sustain/release`（秒，sustain 为 0–1）。

### 2.1 synth 轨（bass / chords / lead / fx）——按乐器名精确映射

| 数据里的 instrument | 出现的 track | 预设 | 振荡器 | 滤波器 | ADSR |
|---|---|---|---|---|---|
| `saw_lead` | bass, lead | `sawLead` (Saw Lead) | sawtooth/sawtooth, 12c, mix 0.5 | 4200 Hz / Q2.2 | 0.012 / 0.15 / 0.75 / 0.22 |
| `square_lead` | bass, lead | `squareLead` (Square Lead) | square/square, 8c, mix 0.3 | 3000 Hz / Q1.4 | 0.008 / 0.12 / 0.7 / 0.18 |
| `guitar_lead` | chords, lead | `guitarLead` (Guitar Lead) | sawtooth/triangle, 5c, mix 0.28 | 2700 Hz / Q3.5 | 0.005 / 0.35 / 0.28 / 0.28 |
| `flute_lead` | lead | `fluteLead` (Flute Lead) | sine/triangle, 6c, mix 0.28 | 2600 Hz / Q0.9 | 0.12 / 0.18 / 0.85 / 0.32 |
| `pluck_synth` | lead | `pluckSynth` (Pluck Synth) | triangle/square, 4c, mix 0.3 | 2000 Hz / Q4.5 | 0.003 / 0.14 / 0.06 / 0.12 |
| `supersaw` | chords | `supersaw` (Supersaw) | sawtooth/sawtooth, 26c, mix 0.55 | 6500 Hz / Q1.0 | 0.02 / 0.35 / 0.85 / 0.45 |
| `warm_pad` | chords | `warmPad` (Warm Poly Pad，原值) | triangle/sawtooth, -9c, mix 0.35 | 2200 Hz / Q1.2 | 0.15 / 0.3 / 0.8 / 0.6 |
| `rhodes_ep` | chords | `rhodesEp` (Rhodes EP) | sine/triangle, 4c, mix 0.32 | 3200 Hz / Q1.1 | 0.004 / 0.9 / 0.3 / 0.5 |
| `m1_organ` | chords | `m1Organ` (M1 Organ) | square/sine, 0c, mix 0.5 | 5200 Hz / Q0.7 | 0.006 / 0.06 / 0.95 / 0.16 |
| `brass_synth` | chords | `brassSynth` (Brass Synth) | sawtooth/square, 9c, mix 0.35 | 2500 Hz / Q2.4 | 0.07 / 0.25 / 0.8 / 0.3 |
| `sub_bass` | bass | `subBass` (Sub Bass) | sine/sine, 0c, mix 0 | 320 Hz / Q0.8 | 0.004 / 0.14 / 0.9 / 0.14 |
| `808_bass` | bass | `bass808` (808 Bass) | sine/triangle, 3c, mix 0.12 | 480 Hz / Q0.9 | 0.004 / 0.9 / 0.55 / 0.5 |
| `acid_303` | bass | `acidBass` (Acid 303 Bass，原值) | sawtooth/square, 0c, mix 0 | 1200 Hz / Q6.0 | 0.005 / 0.15 / 0.2 / 0.1 |
| `reese_bass` | bass | `reeseBass` (Reese Bass) | sawtooth/sawtooth, 28c, mix 0.55 | 620 Hz / Q3.0 | 0.012 / 0.35 / 0.85 / 0.3 |
| `walking_upright` | bass | `walkingUpright` (Walking Upright) | triangle/sine, 2c, mix 0.3 | 700 Hz / Q2.0 | 0.02 / 0.5 / 0.15 / 0.3 |
| `slap_bass` | bass | `slapBass` (Slap Bass) | square/sawtooth, 6c, mix 0.3 | 2000 Hz / Q6.0 | 0.002 / 0.2 / 0.1 / 0.12 |
| `distorted_kick` | bass, kick | `distortedKickBass` (Distorted Kick Bass) | sawtooth/square, 0c, mix 0.25 | 900 Hz / Q5.0 | 0.002 / 0.25 / 0.4 / 0.15 |
| `noise_sweep` | fx | `noiseSweep` (Noise Sweep)¹ | sawtooth/sawtooth, 0c, mix 0 | 1200 Hz / Q5.0 | 0.01 / 0.4 / 0.4 / 0.25 |

¹ `noise_sweep` 不经过复音合成器：实时与离线都保留各自的专用扫频路径（见 §4）。
`noiseSweep` 预设有两个作用：让解析器对该名字是**显式**映射（而非回退到全局默认），
以及作为将来非扫频 FX 音色的起点。

### 2.2 鼓轨（kick / snare / hihat / percussion）——不使用预设

鼓组走 `DrumKitModels` 的专用合成，从不调用解析器。下表中的"预设"只是解析器为保持
**全域可解析**而给出的 track-role 默认值（见 §3 第 3 级），不会影响鼓声。

| 数据里的 instrument | track | 解析器返回（仅当被调用） |
|---|---|---|
| `punchy_kick` / `acoustic_kick` / `sub_kick` / `808_kick` | kick | `subBass` |
| `tight_snare` / `acoustic_snare` / `rimshot` / `clap` / `808_snare` / `reggae_rim` | snare | `pluckSynth` |
| `closed_hat` | hihat | `pluckSynth` |
| `rim_shaker` | percussion | `pluckSynth` |

注意 `distorted_kick` 同时出现在 bass 与 kick 轨：它在 §2.1 中作为合成器音色（别名优先于
角色默认，返回 `distortedKickBass`），而 kick 轨上的它仍由鼓合成处理。

### 2.3 别名表（`INSTRUMENT_PRESET_ALIASES`）

除上表的精确名外，还收录常见同义/旧写法，便于导入的外部工程：
`sawtooth_lead`/`saw`→`sawLead`、`pulse_lead`/`square`→`squareLead`、
`electric_guitar`/`guitar`→`guitarLead`、`flute`→`fluteLead`、`pluck`→`pluckSynth`、
`super_saw`→`supersaw`、`pad`/`synth_pad`→`warmPad`、`rhodes`/`electric_piano`→`rhodesEp`、
`organ`→`m1Organ`、`brass`→`brassSynth`、`sub`→`subBass`、`808`/`808_sub`→`bass808`、
`acid`/`tb_303`→`acidBass`、`reese`→`reeseBass`、`upright`/`double_bass`/`acoustic_bass`→
`walkingUpright`、`slap`→`slapBass`、`sweep`/`fx_riser`/`riser`→`noiseSweep`。

## 3. 回退链

`resolveInstrumentPreset(instrument, trackId)` 是纯函数，按顺序命中即返回，永不抛错：

1. **精确预设键**：instrument 本身（忽略大小写）就是 `DEFAULT_SYNTH_PRESETS` 的键，
   例如 `"supersaw"`、`"warmPad"`。
2. **别名表**：`INSTRUMENT_PRESET_ALIASES[normalize(name)]`。`normalize` 会
   `trim` + 小写 + 把空白/连字符折叠成下划线，所以 `"Saw Lead"`、`"FLUTE-LEAD"`
   都能命中。
3. **track 角色默认**：`bass→acidBass`、`chords/chord/pad→warmPad`、`lead→analogLead`、
   `fx→noiseSweep`；drum 角色也有默认值（kick→subBass、snare/hihat/percussion→pluckSynth），
   用途只是让解析器对数据中出现的全部 `track_id` 都是全域的。
4. **全局默认**：`analogLead`（`GLOBAL_DEFAULT_PRESET_KEY`），仅当连 track 角色也无法识别时。

因此：未知/缺失乐器名 → 回退到该角色的旧音色（行为不比修改前差）；未知乐器 + 未知角色
→ `analogLead`。这条链由 `src/test/instrumentPresets.test.ts` 逐级断言。

## 4. 故意没有动的东西

- **鼓合成与分发**：`playKick` / `playSnare` / `playHiHat` / `playPercussion` 与
  `DrumKitModels` 一行未改；`triggerInstrument` 中鼓分支仍先于合成器分支。
- **FX 扫频路径**：`AudioEngine.playFX` 与 `WavExporter.synthFX` 的锯齿→带通下扫保持原样。
  只有当解析结果**不是** `noiseSweep` 时才会改走 `playPolySynthNote`；当前 159 个 genre
  的 fx 全是 `noise_sweep`，所以听感与导出都保持不变（这也是 exporter-parity 要求）。
- **时序 / swing / gate / ratchet / 效果器机架 / 混音台**：完全未改。
- **`src/data/`**：数据是对的，一个字节未改。
- **原有 4 个预设**（`analogLead`/`warmPad`/`deepPluck`/`acidBass`）名称与数值原样保留；
  `deepPluck` 现在没有数据乐器指向它，但保留为公共预设（`polySynth.test.ts` 与外部
  调用方仍引用）。
- **`instrumentation` 字段**：那是给人看的自然语言列表，不是引擎输入，未使用。

## 5. 如何验证

```
npx tsc --noEmit
npx eslint --quiet <changed files>
npx vitest run src/test/instrumentPresets.test.ts src/test/polySynth.test.ts \
  src/test/exporterParity.test.ts src/test/wavMixerParity.test.ts --reporter=dot
npx vitest run --reporter=dot          # 全量
node scripts/track.mjs fast
npm run build && node scripts/check_budgets.js
```

- `instrumentPresets.test.ts` 用 `node:fs` 扫描 `src/data/genres/*.ts`，提取全部
  `(track_id, instrument)` 对，断言：与 `ALL_GENRES` 一致、每个 synth 乐器都有显式映射、
  解析结果永不等于全局默认、代表性映射（flute≠saw、sub_bass 低通更低、supersaw 失谐更宽）
  正确、四级回退链符合预期。
- `audioScheduler.test.ts` 在 `FakeAudioContext` 上触发单音，断言引擎**实际创建**的
  振荡器波形/失谐与 per-voice 滤波器截止频率等于解析出的预设；`wavMixerParity.test.ts`
  对离线渲染做同样的断言（并证明 fx 仍是单振荡器扫频）。
