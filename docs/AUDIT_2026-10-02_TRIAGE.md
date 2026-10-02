# 外部审计（基准 `1b535ec`）**逐条核定** — 2026-10-02

**报告位置**：`/home/crow/music/1b535ec6114db4635e228c5cafdddd0b6b33a925_report/`（7 份 ✓）
**基准**：GitHub `dev` 的 `1b535ec` ✓；**本树已在其前 8 个提交** ✓（**所以部分结论可能已被后续提交改变 ✓，每条都在**当前树**上重核 ✓**）

**规矩（不变）** ✓：**逐条给 file:line 或实测 ✓；外部意见里有真成立的、也有被测量推翻的 ✓**。

---

## 一、已核定：**四条 P0／P1 全部成立** ✓✓

### ❌→✅ P0-1（音频阻断）：**采样轨只在第一遍发声** ✓ **成立**

* **机制**：`src/audio/samplerSteps.ts:14` 的注释写明 —— **"Every event is scheduled at once, ahead of time. The browser's audio clock is what plays them"** ✓——**即一次把**一整遍**排给音频时钟 ✓**；
* **调用次数**：`scheduleSamplerSteps` 全仓只被 `src/audio/playerFromEngine.ts:262` 调用**一次**（在 `play()` 里 ✓），**没有任何按遍重排** ✗；
* **而合成器轨会重触发**：走带在 `AudioEngine.ts:1892-1898` 按 `loopRange` wrap ✓（`:238` 字段 ✓、`:1367` 设置 ✓）；
* **⇒ 于是第二遍起**：合成器继续响 ✓、采样轨无人再排 → **永久静音** ✗✓✓——**与报告描述一致 ✓**。

### ❌→✅ P0-2（数据损坏）：**任一 clip 缺字段 → 全曲丢该数组** ✓ **成立**

* **出处**：`src/data/songFlatten.ts:174-181` ✓：
  ```ts
  const arrays = OPTIONAL_STEP_ARRAYS.filter(
    (name) => playable.every((bar) => { const track = ...; return Array.isArray(track?.[name]); }) || (name === "velocity" && filled)
  );
  ```
* **后果**：**只要有一个可播小节的 clip 没有 `pitch`，整首歌就不建 `pitch`** ✗✓✓（`gate`／`pitches` 同理 ✓）→ **旋律与发音时长在**全曲**范围丢失 ✓**；
* **它是**有意的**（`:168` 注释 ✓）**，**而报告指出的要害成立** ✓：**这是"静默丢弃" ✓，且已有 `velocity` 作为**例外**先例 ✓**（`:180` ✓）——**⇒ 兜底改成 per-track／per-step 是可行方向 ✓**。

### ❌→✅ P0-3（功能可用性）：**编排无任何持久化** ✓ **成立**

* `src/components/arrangement/ArrangementViewV2.tsx:98` ✓：**`useState<ArrangementV2>(() => createArrangementFromTemplate(songId, undefined, "instrum…"))`** ✓；
* **全仓无持久化通路** ✓：`saveArrangement`／`loadArrangement`／`indexedDB + arrangement` **均 0 命中** ✓；
* **⇒ 刷新即回模板 ✓，编曲全丢 ✓**——**而 `:25-29` 的注释只承认"loop range 与 arm 未持久化" ✓，实际范围更大 ✗**。

### ❌→✅ P1-1（导航）：**Header 用 `<a href="/new">` 整页跳转** ✓ **成立**

* **出处精确** ✓：`src/components/Header.tsx:249-256` ✓（**报告的行号对 ✓，只把目录写成 `components/layout/` ✗**）；
* **而它有明确的设计理由** ✗✓：注释写着 **"an **anchor**, not a tab button: 'new project' is a route of its own (`/new`)"** ✓——**⇒ 报告"改成客户端路由"这条**不是无争议的** ✓：**要么改路由架构 ✓，要么承认这条跳转是有意为之但代价是销毁 AudioContext ✗**，**得由业主定 ✓**。

---

## 二、⚠️ 报告抓到的一件**我的错**（本会话自身更正）✓

报告称 **"标尺循环框为纯 UI 假象"** ✓——**成立，而且出处是代码自己的注释** ✓✓：

* `src/components/arrangement/ArrangementViewV2.tsx:25-29`：**"the loop range and the record-arm flag… Neither is persisted yet, and neither changes what the engine plays — **the loop brace is a ruler-level loop that no audio path reads**. That is stated here rather than implied."** ✓✓

**⇒ 而我在本会话的试听审计里写过** ✗：**"web 有 loop range（`arrangementLoop.ts`／`ArrangementViewV2.tsx:122/441`／`LoopBraceV2`）"** ✓，**并据此说"MCP 缺某一段、而 web 有" ✗✓✓**——**那句话把**引擎具备 loopRange 的能力**与**编排界面的循环框已接线**混为一谈 ✗**。**事实：循环框不接任何音频路径 ✓；引擎的 `loopRange` 是另一条线 ✓。**⇒ **`docs/AUDITION_AUDIT.md` §2 的那一格需要更正 ✓**。

---

## 三、尚未核定（**明说，不假装** ✗✓）

* **P1-2**（`PianoRollV2` 无试听／无快捷键）：**未核** ✓——**报告称无单击试听、无空格／Delete／Cmd+Z ✓**；
* **P1-3**（上万个 DOM `<button>` 导致卡顿 ✓）：**未核** ✓——**需数节点或量帧 ✓**；
* **P1-4**（编排无导出／无分享 URL ✓）：**未核** ✓——**与本会话已做的 `render_arrangement` 小节范围有关但不同 ✓**；
* **第 03 与 04 份的技能类结论**（200ms lookahead ✓、4 复音截断 ✓、GC 爆音 ✓、iOS 兼容 ✓）：**均未核** ✓；
* **第 06 份的路线图**：**属建议 ✓，不是可判事实 ✓**。

---

## 四、建议顺序（**影响 × 可判**）✓

1. **P0-1 采样循环静音** ✓✓——**唯一一条"听不到声音"的 ✓，且机制已定位到 `playerFromEngine.ts:262` 的单次排程 ✓；
2. **P0-2 全曲丢数组** ✓✓——**数据损坏 ✓，且`velocity` 例外已经给出改成 per-track 兜底的先例 ✓；
3. **P0-3 编排持久化** ✓——**工程量最大 ✓（要接 IndexedDB 与工程包 ✓），但它决定"人类能否不丢心血" ✓；
4. **P1-1 导航** ✓——**先要业主在"改路由"与"接受代价"之间选 ✓**（**见上 ✓**）。
