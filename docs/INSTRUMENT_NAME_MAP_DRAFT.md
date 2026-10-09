# 乐器显示名映射（草稿 v2，待你过目）

本文件只是提案：没有改数据、也没有改代码。你确认后我才动手。

## 我的改法（只动看不懂的术语，其余原样）

| 术语 | 建议 | 说明 |
| --- | --- | --- |
| arco | Bowed | 弓奏 |
| pizz | Plucked | 拨奏 |
| modwheel / mw | mod wheel | |
| 3vel / 5vel | 3 layers / 5 layers | 力度层数 |
| … map | … · keyswitch map | 映射类程序，不是可直接演奏的音色（见下） |
| sus / stac | sustain / staccato | |

## 需要你确认的 4 个词（我不猜）

* three —— 是 3 根弦，还是 3 层力度？
* six —— 同上
* basic —— 是基础技法集，还是另一套采样？
* map —— 这类程序很可能是键位切换映射（不是音色）；要不要仍然列出来？
* looped —— 循环采样（可无限保持），我按原词保留

## 逐条提案

### D. Smolken Rübner double bass (`dsmolken-double-bass`) — 1 项

| 现在的名字 | 建议显示 |
| --- | --- |
| `Double bass, arco` | **Double bass, Bowed** |

### Karoryfer Black And Blue Basses (`karoryfer-black-and-blue-basses`) — 1 项

| 现在的名字 | 建议显示 |
| --- | --- |
| `darkblack stac` | **Darkblack staccato** |

### Karoryfer Meatbass (`karoryfer-meatbass`) — 39 项

| 现在的名字 | 建议显示 |
| --- | --- |
| `arco 3vel` | **Bowed 3 layers** |
| `arco 5vel` | **Bowed 5 layers** |
| `arco basic` | **Bowed basic** |
| `arco basic legato map` | **Bowed basic · legato keyswitch map** |
| `arco basic map` | **Bowed · keyswitch map** |
| `arco looped basic legato map` | **Bowed looped basic · legato keyswitch map** |
| `arco looped basic map` | **Bowed looped · keyswitch map** |
| `arco looped six legato first map` | **Bowed looped six legato first map** |
| `arco looped six legato map` | **Bowed looped six · legato keyswitch map** |
| `arco looped six map` | **Bowed looped six map** |
| `arco looped three legato map` | **Bowed looped three · legato keyswitch map** |
| `arco looped three map` | **Bowed looped three map** |
| `arco modwheel` | **Bowed mod wheel** |
| `arco mw basic legato map` | **Bowed mod wheel basic · legato keyswitch map** |
| `arco mw basic map` | **Bowed mod wheel · keyswitch map** |
| `arco mw six legato first map` | **Bowed mod wheel six legato first map** |
| `arco mw six legato map` | **Bowed mod wheel six · legato keyswitch map** |
| `arco mw six map` | **Bowed mod wheel six map** |
| `arco mw three legato map` | **Bowed mod wheel three · legato keyswitch map** |
| `arco mw three map` | **Bowed mod wheel three map** |
| `arco six` | **Bowed six** |
| `arco six legato first map` | **Bowed six legato first map** |
| `arco six legato map` | **Bowed six · legato keyswitch map** |
| `arco six map` | **Bowed six map** |
| `arco three` | **Bowed three** |
| `arco three legato map` | **Bowed three · legato keyswitch map** |
| `arco three map` | **Bowed three map** |
| `pizz` | **Plucked** |
| `pizz basic` | **Plucked basic** |
| `pizz basic legato map` | **Plucked basic · legato keyswitch map** |
| `pizz basic map` | **Plucked · keyswitch map** |
| `pizz six` | **Plucked six** |
| `pizz six legato first map` | **Plucked six legato first map** |
| `pizz six legato map` | **Plucked six · legato keyswitch map** |
| `pizz six map` | **Plucked six map** |
| `pizz three` | **Plucked three** |
| `pizz three legato first map` | **Plucked three legato first map** |
| `pizz three legato map` | **Plucked three · legato keyswitch map** |
| `pizz three map` | **Plucked three map** |

