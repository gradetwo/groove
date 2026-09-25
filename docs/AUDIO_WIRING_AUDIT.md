# 音频接线审计：一个资源只能有一个归属

这份记录回答一个问题：**"资源被两个调用方按不同方式接线"这一类问题，别处还有没有？**

起因是 UK Garage 主奏：点轨道头的预览按钮两三次，主奏就变成没声音或怪音（GS-1 开）。根因是**一行接线**——预览被接到 master gain，而 GS-1 的规则是一个宿主只能绑一个输出；于是每次预览都把正在服务循环的宿主拆掉重建。同类问题**之前已经为打击垫修过一次**（`auditionTrack` 特意传 `isAudition = false` 并写下原因），但轨道头走的 `triggerNote` 仍传 `true`。既然同一类问题出现过两次，就值得把整层过一遍，而不是只修这一处。

## 一、规则

**一个池化的宿主（GS-1 host）在生命周期内只绑定一个输出节点；调用方每次都必须给出同一个节点。**
池子的应对规则是"目标不同 ⇒ 重建该槽位"——这条规则让错误**不会**变成静音或错音残留，但会**拆掉正在发声的宿主**，听感就是断音/怪音。所以真正的约束是：**不要给它重建的理由。**

## 二、逐个查过的地方

| 位置 | 传给池子的目标 | 结论 |
| --- | --- | --- |
| `triggerInstrument`（**预览与排程共用**） | `getTrackDestination(trackIdx)` | **曾经是错的**（预览走 master gain），已修 |
| `playChord` / `playLead` / `playFX` | 由 `triggerInstrument` 传入的**同一个** `dest` | 一致 |
| `auditionTrack`（打击垫入口） | 走同一套 dispatch | 一致 |
| 导出器（离线） | 每个宿主**连接一次**到 `trackStrips[t].insert.input` —— 与 `getTrackDestination` 解析出的正是同一个节点 | 一致 |
| `getTrackDestination` 的 `masterGain` 兜底 | 实践中到不了：`initAudioContext` 在**同一个代码块**里建图并 `setupTrackStrips(16)`，上下文与通道条同时存在 | 一致 |
| `busInputFor`（鼓/音乐分组总线） | 只被通道条**自己的输出**使用，从不作为池子的目标 | 不适用 |
| 节拍器 | 原生振荡器直连 master | 不适用 |
| `getScrubTarget`（波形拖动试听） | 指向 music 总线，但 `useGenreAudition` 是通过 `auditionTrack` 发声，不直接驱动池子 | 不适用 |
| `ChordAudioEngine` / `AnatomyKickEngine` | 各自独立的图与 master | 不适用 |

## 三、仍然会触发重建、且是有意接受的三处

它们都**不会**产生第二个绑定，只会重建一次（池子的规则保证）：

1. **换曲风/换音色**（instrument 或 patch 变了）——本来就该换宿主；
2. **`setSpatialMode` / `enableTrackAnalysers`**——它们会 `releaseTrackStrips()` 后重建通道条，于是 `insert.input` 是**新节点**；下个音符发现目标变了，重建宿主。代价是那一刻该轨静音到下一个音符，但不会留下卡住的声部；
3. **P2.5 采样导入**（换采样时重新导入）。

这些是"状态真的变了"，与"同一状态被两个调用方描述成两种"不同——后者才是这次那个 bug。

## 四、把规则钉住

`src/test/gs1PreviewDestination.test.ts` 现在覆盖**两个**层面：

- 具体的回归：轨道头预览与打击垫必须落在**同一个**目标（这条在旧代码上失败：`expected 2 to be 1`）；
- 一般的不变量：GS-1 声部的**三种角色**（`chords`/`lead`/`fx`）× **三种触发方式**（排程、轨道头预览、打击垫），对每个**轨索引**只能出现一个目标，并且不同轨的目标彼此不同（否则"同一个目标"会因为大家都在 master 上而假通过）。

旧代码上第二条同样失败（`track 6 was handed 2 destinations`），所以它是真的在守这条规则，而不是在描述现状。今后任何新的调用方只要拿错节点，这里就会红。
