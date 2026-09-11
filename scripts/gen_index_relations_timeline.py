import os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DATA = os.path.join(ROOT, "src", "data")
GENRES_DIR = os.path.join(SRC_DATA, "genres")

# 1. Generate genres/index.ts
modules = [
    ("house.ts", "HOUSE_GENRES"),
    ("techno.ts", "TECHNO_GENRES"),
    ("trance.ts", "TRANCE_GENRES"),
    ("dubstep.ts", "DUBSTEP_GENRES"),
    ("dnb.ts", "DNB_GENRES"),
    ("uk_bass.ts", "UK_BASS_GENRES"),
    ("trap_drill.ts", "TRAP_DRILL_GENRES"),
    ("future_downtempo.ts", "FUTURE_DOWNTEMPO_GENRES"),
    ("hard_electro.ts", "HARD_ELECTRO_GENRES"),
    ("rock_metal.ts", "ROCK_METAL_GENRES"),
    ("hiphop.ts", "HIPHOP_GENRES"),
    ("jazz_blues.ts", "JAZZ_BLUES_GENRES"),
    ("pop_rnb.ts", "POP_RNB_GENRES"),
    ("latin_world.ts", "LATIN_WORLD_GENRES"),
]

import_lines = []
all_vars = []
var_names = []
for mod, var in modules:
    mod_name = mod.replace(".ts", "")
    import_lines.append(f"import {{ {var} }} from './{mod_name}';")
    all_vars.append(f"...{var}")
    var_names.append(var)

index_content = f"""import {{ Genre }} from '../../types/genre';
{chr(10).join(import_lines)}

export {{
  {f',{chr(10)}  '.join(var_names)}
}};

export const ALL_GENRES: Genre[] = [
  {f',{chr(10)}  '.join(all_vars)}
];

export const GENRES_MAP: Record<string, Genre> = ALL_GENRES.reduce((acc, genre) => {{
  acc[genre.id] = genre;
  return acc;
}}, {{}} as Record<string, Genre>);

export const ELECTRONIC_GENRES = ALL_GENRES.filter(g => g.category === 'Electronic');
export const NON_ELECTRONIC_GENRES = ALL_GENRES.filter(g => g.category !== 'Electronic');

export const GENRE_CATEGORIES = [
  'Electronic',
  'Rock/Metal',
  'Hip Hop',
  'Jazz/Blues',
  'Pop/R&B',
  'Latin/World'
] as const;
"""

with open(os.path.join(GENRES_DIR, "index.ts"), "w", encoding="utf-8") as f:
    f.write(index_content)
print("Created src/data/genres/index.ts")

# 2. Extract all IDs from genre files to ensure relations link to valid IDs
all_genres = []
for mod, var in modules:
    file_path = os.path.join(GENRES_DIR, mod)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        marker = "= ["
        start_idx = content.find(marker)
        if start_idx != -1:
            start = start_idx + 2
            end = content.rfind("]") + 1
            items = json.loads(content[start:end])
            all_genres.extend(items)

genre_ids = set(g["id"] for g in all_genres)
print(f"Verified {len(genre_ids)} unique genre IDs in total.")

# 3. Build relations network
relations = []
added_pairs = set()

def add_rel(src, tgt, rtype, weight, desc_en="", desc_zh=""):
    if src in genre_ids and tgt in genre_ids and src != tgt:
        pair_key = f"{src}->{tgt}:{rtype}"
        if pair_key not in added_pairs:
            added_pairs.add(pair_key)
            relations.append({
                "source": src,
                "target": tgt,
                "type": rtype,
                "weight": weight,
                "description": {
                    "en": desc_en or f"{src} has a {rtype.replace('_', ' ')} connection with {tgt}.",
                    "zh": desc_zh or f"{src} 与 {tgt} 具有 {rtype} 关系。"
                }
            })

# Core historical cross-genre fusions & connections
fusions = [
    # House tree
    ("disco", "chicago-house", "origin_from", 5, "House evolved from disco edits.", "浩室脱胎于迪斯科黑胶混音。"),
    ("chicago-house", "deep-house", "derived_to", 5, "Deep house slowed and deepened Chicago house.", "Deep House 放缓加深了芝加哥浩室。"),
    ("chicago-house", "acid-house", "derived_to", 5, "Acid house emerged from 303 experiments.", "Acid House 诞生于 303 合成器实验。"),
    ("chicago-house", "tech-house", "fusion_with", 4, "Tech house merged techno and house.", "Tech House 融合了 Techno 与 House。"),
    ("chicago-house", "french-house", "influenced_by", 4, "French touch sampled disco with house beats.", "法式触感结合了迪斯科采样与浩室节拍。"),
    ("chicago-house", "ghetto-house", "derived_to", 4, "Chicago warehouse spawned raw ghetto house.", "芝加哥仓库派对催生了粗砺的 Ghetto House。"),
    ("ghetto-house", "footwork", "derived_to", 5, "Footwork evolved from ghetto house and juke.", "Footwork 由 Ghetto House 与 Juke 演进而来。"),
    ("deep-house", "amapiano", "fusion_with", 5, "Amapiano fused deep house with jazz and kwaito.", "Amapiano 融合了深邃浩室与爵士和声。"),
    ("deep-house", "tropical-house", "derived_to", 4, "Tropical house adapted deep house grooves.", "Tropical House 吸收了 Deep House 的律动。"),
    ("deep-house", "melodic-house", "derived_to", 4, "Melodic house enriched deep house with arpeggios.", "Melodic House 为深邃浩室注入电影级琶音。"),
    ("deep-house", "microhouse", "derived_to", 4, "Microhouse stripped deep house to subtle micro-textures.", "微型浩室将深邃浩室精简为微观声音颗粒。"),
    ("chicago-house", "progressive-house", "derived_to", 4, "Progressive house introduced long build-ups.", "渐进浩室引入了漫长的和声递进。"),
    ("chicago-house", "electro-house", "derived_to", 4, "Electro house injected abrasive buzzsaw leads.", "电子浩室注入了极具侵略性的电锯锯齿波。"),
    ("electro-house", "bass-house", "derived_to", 5, "Bass house merged electro house with dubstep growls.", "低音浩室融合了电子浩室与 Dubstep 嘶吼。"),
    ("deep-house", "afro-house", "fusion_with", 5, "Afro house fused deep house with African polyrhythms.", "非裔浩室融合了深邃浩室与非洲传统打击乐。"),
    ("disco", "nu-disco-house", "derived_to", 5, "Nu-disco modernized vintage 70s disco with club punch.", "新迪斯科将 70 年代迪斯科注入现代舞池冲击力。"),

    # Techno tree
    ("electro", "detroit-techno", "origin_from", 5, "Detroit techno originated from electro and funk.", "底特律 Techno 起源于 Electro 与放克。"),
    ("detroit-techno", "minimal-techno", "derived_to", 5, "Minimal techno stripped Detroit techno down.", "极简 Techno 精简了底特律 Techno 骨架。"),
    ("detroit-techno", "dub-techno", "fusion_with", 5, "Basic Channel fused techno with Jamaican dub.", "Basic Channel 将 Techno 与牙买加 Dub 融合。"),
    ("detroit-techno", "industrial-techno", "fusion_with", 4, "Industrial techno infused harsh noise.", "工业 Techno 融入了残酷工业噪音。"),
    ("industrial-techno", "hard-techno", "derived_to", 5, "Hard techno accelerated industrial aggression.", "Hard Techno 加速了工业侵略性。"),
    ("hard-techno", "schranz", "regional_variant", 4, "Schranz is Frankfurt's high-speed hard techno.", "Schranz 是德国法兰克福的高速硬核分支。"),
    ("detroit-techno", "ambient-techno", "derived_to", 4, "Ambient techno prioritized headphone meditation.", "氛围 Techno 专注于耳机深层冥想。"),
    ("detroit-techno", "peak-time-techno", "derived_to", 4, "Peak time techno amplified festival rumbles.", "黄金时段 Techno 放大了音乐节低频轰鸣。"),
    ("minimal-techno", "raw-techno", "derived_to", 4, "Raw techno returned to hardware grit.", "原始 Techno 回归模拟硬件纯粹质感。"),

    # Trance tree
    ("chicago-house", "uplifting-trance", "origin_from", 4, "Trance built on European house and techno.", "Trance 建立在欧洲浩室与 Techno 基础上。"),
    ("uplifting-trance", "progressive-trance", "derived_to", 4, "Progressive trance deepened the builds.", "前卫 Trance 深化了氛围铺垫。"),
    ("acid-house", "goa-trance", "influenced_by", 5, "Goa trance adopted 303 acid lines on Goa beaches.", "Goa Trance 在果阿海滩采纳了 303 酸性线条。"),
    ("goa-trance", "psytrance", "derived_to", 5, "Psytrance became global evolution of Goa trance.", "Psytrance 成为果阿 Trance 的全球进化形态。"),
    ("uplifting-trance", "hard-trance", "derived_to", 4, "Hard trance added heavy distorted kicks.", "Hard Trance 加入了重型失真底鼓。"),
    ("uplifting-trance", "vocal-trance", "derived_to", 5, "Vocal trance centered emotional top-line singing.", "人声 Trance 以深情主旋律声乐为核心。"),
    ("uplifting-trance", "euro-trance", "derived_to", 4, "Euro-trance popularized commercial dance-pop hooks.", "欧陆 Trance 普及了商业流行舞曲 Hook。"),
    ("uplifting-trance", "dream-trance", "derived_to", 4, "Robert Miles popularized peaceful acoustic piano trance.", "Robert Miles 普及了静谧抒情的原声钢琴出神舞曲。"),
    ("uplifting-trance", "tech-trance", "fusion_with", 4, "Tech trance merged techno percussion with trance energy.", "Tech Trance 融合了 Techno 打击乐与 Trance 能量。"),

    # UK Bass, Garage, Dubstep, DnB
    ("dub", "reggae", "origin_from", 5, "Dub originated from studio manipulations of reggae.", "Dub 起源于雷鬼音乐的调音台解构。"),
    ("dub", "dubstep", "origin_from", 5, "Dubstep inherited dub's space, echo, and sub-bass.", "Dubstep 继承了 Dub 的空间感、回声与超低频。"),
    ("uk-garage", "2-step-garage", "derived_to", 5, "2-Step removed the 4/4 kick for syncopation.", "2-Step 抽去 4/4 稳定踢点以增强切分。"),
    ("2-step-garage", "grime", "derived_to", 5, "Grime grew out of dark garage pirate radio.", "Grime 脱胎于黑暗车库音乐电台。"),
    ("2-step-garage", "dubstep", "origin_from", 5, "Dubstep emerged from instrumental 2-step garage.", "Dubstep 诞生于纯器乐 2-Step 车库音乐。"),
    ("uk-garage", "speed-garage", "derived_to", 4, "Speed garage accelerated garage with heavy drops.", "极速车库加快车库节奏并加入重型下潜。"),
    ("speed-garage", "bassline", "derived_to", 5, "Bassline evolved in Sheffield with vocal hooks and donks.", "Bassline 在谢菲尔德演化，加入人声 Hook 与 Donk 低音。"),
    ("uk-garage", "uk-funky", "fusion_with", 4, "UK funky blended UK garage with tribal rhythms.", "UK Funky 将英国车库与部落节奏融合。"),
    ("bassline", "speedbass", "derived_to", 4, "Speedbass accelerated bassline to 160 BPM.", "Speedbass 将 Bassline 加速至 160 BPM。"),
    ("dubstep", "brostep", "derived_to", 5, "Brostep pushed mid-range FM growls to festival stages.", "Brostep 将中频 FM 咆哮推向大型舞台。"),
    ("dubstep", "riddim", "derived_to", 4, "Riddim isolated minimal, repetitive triplet stabs.", "Riddim 提炼了极简重复的三连音刺音。"),
    ("dubstep", "future-garage", "derived_to", 4, "Burial pioneered atmospheric future garage.", "Burial 开创了充满氛围感的未来车库。"),
    ("dubstep", "melodic-dubstep", "derived_to", 5, "Melodic dubstep merged dubstep drums with supersaws.", "旋律 Dubstep 融合了 Dubstep 鼓组与 Supersaw 音墙。"),
    ("dubstep", "post-dubstep", "derived_to", 4, "Post-dubstep deconstructed bass music for indie songwriting.", "后 Dubstep 为独立创作解构了低音音乐。"),
    ("dubstep", "tearout-dubstep", "derived_to", 4, "Tearout pushed machine-gun metallic aggression.", "Tearout 将机关枪金属撕裂感推向极限。"),
    ("dubstep", "chillstep", "derived_to", 4, "Chillstep softened 140 BPM beats with ambient pads.", "Chillstep 用氛围铺底柔化了 140 BPM 节拍。"),
    ("dubstep", "deathstep", "fusion_with", 4, "Deathstep fused death metal with aggressive dubstep.", "Deathstep 融合了死亡金属与残暴 Dubstep。"),
    ("jungle", "liquid-dnb", "derived_to", 4, "Liquid DnB smoothed jungle breaks with soul.", "Liquid DnB 用灵魂乐柔化了丛林碎拍。"),
    ("jungle", "neurofunk", "derived_to", 4, "Neurofunk introduced complex sci-fi sound design.", "Neurofunk 引入了复杂的科幻声音设计。"),
    ("jungle", "jump-up", "derived_to", 4, "Jump up energized DnB with bouncy party screeches.", "Jump Up 用跳跃派对尖叫激活了 DnB。"),
    ("jungle", "techstep", "derived_to", 4, "Techstep stripped jungle to cold industrial drums.", "Techstep 将丛林乐精简为冷酷工业鼓点。"),
    ("jungle", "breakcore", "derived_to", 4, "Breakcore accelerated drum breaks to chaotic extremes.", "Breakcore 将鼓碎拍加速到混沌极致。"),
    ("jungle", "ragga-jungle", "origin_from", 5, "Ragga jungle fused sliced breaks with Jamaican toasting.", "Ragga 丛林乐融合了切分碎拍与牙买加喊麦。"),
    ("jungle", "sambass", "fusion_with", 4, "Sambass blended DnB breaks with Brazilian samba.", "Sambass 将 DnB 碎拍与巴西桑巴融合。"),
    ("neurofunk", "halftime", "derived_to", 4, "Halftime slowed 174 BPM sound design to hip-hop bounce.", "Halftime 将 174 BPM 音色设计放慢为嘻哈弹跳。"),

    # Trap & Drill
    ("southern-hip-hop", "trap-rap", "derived_to", 5, "Trap rap emerged from Atlanta southern hip hop.", "Trap 说唱脱胎于亚特兰大南方嘻哈。"),
    ("trap-rap", "edm-trap", "derived_to", 5, "EDM trap combined 808s with festival synths.", "EDM Trap 将 808 与电音节合成器结合。"),
    ("edm-trap", "hard-trap", "derived_to", 4, "Hard trap combined distorted kicks with trap bounce.", "Hard Trap 将失真底鼓与 Trap 弹跳结合。"),
    ("edm-trap", "hybrid-trap", "derived_to", 4, "Hybrid trap fused EDM trap with dubstep growls.", "混种 Trap 融合了 EDM Trap 与 Dubstep 咆哮。"),
    ("edm-trap", "future-bass", "influenced_by", 4, "Future bass borrowed trap half-time beats.", "Future Bass 借鉴了 Trap 的半速节拍。"),
    ("future-bass", "kawaii-future-bass", "derived_to", 4, "Kawaii future bass infused anime visuals and chiptune.", "可爱未来贝斯融入了动漫美学与芯片音效。"),
    ("trap-rap", "chicago-drill", "derived_to", 5, "Chicago drill hardened trap with street reality.", "芝加哥 Drill 用冷酷现实硬化了 Trap。"),
    ("chicago-drill", "uk-drill", "regional_variant", 5, "UK drill adapted Chicago drill with sliding 808s.", "UK Drill 改造芝加哥钻头，引入滑音 808。"),
    ("uk-drill", "brooklyn-drill", "regional_variant", 5, "Brooklyn drill brought UK drill sliding 808s to NYC.", "布鲁克林 Drill 将滑音 808 带回纽约。"),
    ("brooklyn-drill", "jersey-drill", "fusion_with", 5, "Jersey drill fused drill 808s with club bounce.", "泽西 Drill 融合了钻头 808 与泽西俱乐部弹跳。"),
    ("jersey-club", "jersey-drill", "origin_from", 5, "Jersey drill adapted Jersey Club's 5-beat kick bounce.", "泽西 Drill 采纳了泽西俱乐部的 5 拍底鼓弹跳。"),

    # Downtempo & Ambient
    ("ambient", "ambient-dub", "derived_to", 4, "Ambient dub added dub delay and pulsing sub.", "氛围 Dub 加入了 Dub 延迟与脉冲超低音。"),
    ("ambient", "downtempo", "derived_to", 4, "Downtempo gave ambient music a relaxed beat.", "缓拍音乐为氛围音乐注入舒缓节拍。"),
    ("downtempo", "trip-hop", "derived_to", 5, "Trip hop darkened downtempo with cinematic noir.", "神游舞曲为缓拍注入暗黑电影质感。"),
    ("trip-hop", "glitch-hop", "derived_to", 4, "Glitch hop added digital micro-edits to hip-hop.", "故障嘻哈为嘻哈节拍增添数字微切片。"),
    ("ambient", "idm", "influenced_by", 4, "IDM expanded ambient textures with complex algorithms.", "IDM 结合复杂算法拓展了氛围纹理。"),
    ("synth-pop", "synthwave", "derived_to", 5, "Synthwave revived 80s synth-pop and movie nostalgia.", "合成器波复兴了 80 年代合成流行与电影怀旧。"),
    ("synth-pop", "vaporwave", "influenced_by", 4, "Vaporwave slowed down 80s commercial pop.", "蒸汽波慢放解构了 80 年代商业流行。"),
    ("synth-pop", "chillwave", "derived_to", 4, "Chillwave introduced dreamy tape-warmed indie pop.", "冷波开创了梦幻磁带质感的独立流行。"),
    ("chicago-house", "lofi-house", "derived_to", 4, "Lo-Fi house recorded house onto cassette tapes.", "低保真浩室将浩室音乐实录于卡式磁带。"),
    ("electro", "chiptune", "influenced_by", 4, "Chiptune celebrated pure PSG sound chip music.", "芯片音乐颂唱纯粹 PSG 声音芯片的魅力。"),

    # Hard & Club
    ("hard-techno", "hardcore-gabber", "derived_to", 5, "Gabber accelerated hard techno to 180 BPM.", "嘎巴硬核将硬核 Techno 加速至 180 BPM。"),
    ("hardcore-gabber", "frenchcore", "derived_to", 4, "Frenchcore accelerated kicks to 200 BPM with bounce.", "法兰西硬核将底鼓加速至 200 BPM 并加入反拍弹跳。"),
    ("hardcore-gabber", "happy-hardcore", "derived_to", 4, "Happy hardcore added piano riffs and joyful vocals.", "快乐硬核加入了明亮钢琴与欢快人声。"),
    ("hard-techno", "hardstyle", "derived_to", 5, "Hardstyle sculpted the signature pitched reverse bass.", "Hardstyle 塑造了标志性的定调反转贝斯。"),
    ("reggaeton", "moombahton", "fusion_with", 5, "Moombahton fused Dutch house with reggaeton dembow.", "蒙巴顿融合了荷兰浩室与雷鬼顿 Dembow 节拍。"),
    ("ghetto-house", "jersey-club", "influenced_by", 4, "Jersey club evolved bouncy Baltimore & ghetto beats.", "泽西俱乐部演化自充满弹性的街区律动。"),
    ("southern-hip-hop", "phonk", "derived_to", 5, "Phonk revived 90s Memphis cassette rap with 808 cowbells.", "Phonk 用 808 牛铃复兴了 90 年代孟菲斯磁带说唱。"),
    ("phonk", "drift-phonk", "derived_to", 5, "Drift phonk accelerated phonk with extreme distortion.", "漂移 Phonk 用极限失真加速了放克说唱。"),
    ("electro", "breakbeat", "derived_to", 4, "Breakbeat broadened electro funk into UK breakbeats.", "碎拍乐将电子放克拓宽为充满活力的英国碎拍。"),
    ("breakbeat", "big-beat", "derived_to", 5, "Big beat amplified breakbeats with heavy rock guitars.", "大碎拍用重型摇滚吉他强化了碎拍能量。"),

    # Rock & Blues
    ("delta-blues", "chicago-blues", "derived_to", 5, "Chicago blues electrified Mississippi delta blues.", "芝加哥布鲁斯将三角洲布鲁斯通电放大。"),
    ("chicago-blues", "rock-and-roll", "origin_from", 5, "Rock and Roll formed from blues and rhythm and blues.", "摇滚乐脱胎于布鲁斯与节奏布鲁斯。"),
    ("rock-and-roll", "blues-rock", "derived_to", 4, "Blues rock amplified blues improvisation.", "布鲁斯摇滚放大了布鲁斯即兴。"),
    ("blues-rock", "hard-rock", "derived_to", 5, "Hard rock turned blues riffs into power chords.", "硬摇滚将布鲁斯 Riff 转变为强力和弦。"),
    ("hard-rock", "heavy-metal", "derived_to", 5, "Black Sabbath birthed heavy metal from hard rock.", "Black Sabbath 从硬摇滚中孕育了重金属。"),
    ("heavy-metal", "thrash-metal", "derived_to", 5, "Thrash metal sped metal up with punk fury.", "激流金属用朋克狂怒加速了金属乐。"),
    ("thrash-metal", "death-metal", "derived_to", 5, "Death metal pushed thrash speed into brutal growls.", "死亡金属将激流速度推向狂暴兽吼极限。"),
    ("thrash-metal", "black-metal", "derived_to", 4, "Black metal focused on raw cold atmospheric fury.", "黑金属专注于原始冰冷的狂乱氛围。"),
    ("heavy-metal", "doom-metal", "derived_to", 5, "Doom metal dragged metal into agonizingly heavy slow tempos.", "毁灭金属将金属乐拉入缓慢沉重的泥沼。"),
    ("heavy-metal", "metalcore", "fusion_with", 5, "Metalcore merged melodic death metal with punk breakdowns.", "金属核融合了旋律死金与朋克蹲点。"),
    ("punk-rock", "post-punk", "derived_to", 5, "Post-punk transformed punk into artistic expression.", "后朋克将朋克转化为艺术探索。"),
    ("post-punk", "new-wave", "derived_to", 4, "New wave injected pop hooks and synths.", "新浪潮注入了流行 Hook 与合成器。"),
    ("punk-rock", "grunge", "influenced_by", 4, "Grunge merged punk raw energy with metal sludge.", "垃圾摇滚融合了朋克粗砺与金属泥泞。"),
    ("grunge", "alternative-rock", "derived_to", 4, "Alternative rock expanded grunge's college radio dominance.", "另类摇滚拓展了垃圾摇滚在大学电台的影响。"),
    ("hard-rock", "progressive-rock", "influenced_by", 4, "Progressive rock introduced classical complexity to rock.", "前卫摇滚为摇滚引入古典交响复杂度。"),
    ("alternative-rock", "math-rock", "derived_to", 4, "Math rock structured rock around odd meters and tapping.", "数学摇滚围绕奇数节拍与点弦构建音乐。"),
    ("post-punk", "shoe-gaze", "derived_to", 5, "Shoegaze buried melodies under reverse-reverb noise walls.", "自赏摇滚将旋律隐匿于反向混响吉他噪音之下。"),

    # Hip Hop
    ("old-school-hip-hop", "boom-bap", "derived_to", 5, "Boom bap refined the drum breaks on the Akai MPC.", "Boom Bap 在 Akai MPC 上提炼了击打律动。"),
    ("old-school-hip-hop", "east-coast-hip-hop", "derived_to", 5, "East Coast hip hop sharpened street lyrical storytelling.", "东海岸嘻哈磨砺了街头叙事与多音节押韵。"),
    ("old-school-hip-hop", "west-coast-hip-hop", "derived_to", 5, "West Coast hip hop introduced funk bass cruiser bounce.", "西海岸嘻哈引入了放克低音巡游律动。"),
    ("west-coast-hip-hop", "g-funk", "derived_to", 5, "Dr. Dre crafted G-funk with sliding Moog synth leads.", "Dr. Dre 用滑音 Moog 合成器独奏铸就 G-Funk。"),
    ("boom-bap", "conscious-hip-hop", "influenced_by", 4, "Conscious hip hop brought social awareness to boom-bap.", "自觉说唱为 Boom Bap 注入社会正义反思。"),
    ("boom-bap", "lofi-hip-hop", "derived_to", 5, "Lo-Fi hip hop relaxed boom-bap with jazz chords and crackle.", "Lo-Fi 嘻哈用爵士和弦与黑胶底噪舒缓了 Boom-Bap。"),
    ("trap-rap", "emo-rap", "derived_to", 5, "Emo rap paired 808 trap drums with vulnerable guitars.", "Emo 说唱将 808 鼓点与感伤吉他独白结合。"),
    ("trap-rap", "cloud-rap", "derived_to", 4, "Cloud rap floated trap drums in dreamlike reverb clouds.", "云雾说唱让 Trap 鼓点浮沉于梦境混响云雾中。"),

    # Jazz & Pop & Latin
    ("delta-blues", "texas-blues", "derived_to", 4, "Texas blues energized acoustic blues with shuffle.", "德州布鲁斯用摇摆律动激活了原声布鲁斯。"),
    ("chicago-blues", "electric-blues", "derived_to", 5, "Electric blues set the template for modern soloing.", "电气布鲁斯奠定了现代电吉他独奏范式。"),
    ("traditional-jazz", "bebop", "derived_to", 5, "Bebop transformed swing jazz into complex art.", "Bebop 将摇摆爵士转化为高难度艺术。"),
    ("bebop", "cool-jazz", "derived_to", 4, "Cool jazz reacted against bebop with relaxed subtlety.", "冷爵士反叛比波普的燥热，追求温文尔雅。"),
    ("bebop", "hard-bop", "derived_to", 4, "Hard bop re-infused bebop with blues and gospel.", "硬波普为比波普重新注入布鲁斯与福音。"),
    ("cool-jazz", "modal-jazz", "derived_to", 5, "Kind of Blue established modal improvisation.", "《Kind of Blue》开创了调式即兴时代。"),
    ("bebop", "free-jazz", "derived_to", 4, "Free jazz discarded fixed meters and chord charts.", "自由爵士摒弃了固定小节与和弦框架。"),
    ("modal-jazz", "jazz-fusion", "derived_to", 4, "Miles Davis fused modal jazz with rock amplifiers.", "Miles Davis 将调式爵士与摇滚放大器结合。"),
    ("jazz-fusion", "smooth-jazz", "derived_to", 4, "Smooth jazz commercialized fusion for radio playlists.", "轻柔爵士将融合爵士商业化，适合电台播放。"),
    ("traditional-jazz", "acid-jazz", "influenced_by", 4, "Acid jazz sampled jazz records over club breakbeats.", "酸性爵士在俱乐部碎拍上采样爵士黑胶。"),
    ("traditional-jazz", "gypsy-jazz", "fusion_with", 4, "Django Reinhardt fused Paris swing with Romani music.", "Django Reinhardt 将巴黎摇摆与罗姆音乐融合。"),
    ("traditional-pop", "soul", "influenced_by", 4, "Soul merged traditional pop vocal prowess with gospel.", "灵魂乐融合了传统声乐技巧与福音激情。"),
    ("soul", "motown", "derived_to", 5, "Motown industrialized soul into global pop anthems.", "摩城将灵魂乐工业化，造就全球流行经典。"),
    ("soul", "funk", "derived_to", 5, "James Brown transformed soul into groove-driven funk.", "James Brown 将灵魂乐升华为主打律动的放克。"),
    ("funk", "disco", "derived_to", 5, "Disco streamlined funk rhythms into 4/4 dance floors.", "迪斯科将放克节拍规整为四四拍舞池轰炸。"),
    ("disco", "eurodance", "derived_to", 4, "Eurodance accelerated disco grooves to 140 BPM with synths.", "欧陆舞曲将迪斯科节拍加速至 140 BPM。"),
    ("soul", "neo-soul", "derived_to", 5, "Neo-soul revitalized 70s soul with hip-hop beats.", "新灵魂乐用嘻哈节拍复兴了 70 年代灵魂乐。"),
    ("soul", "contemporary-rnb", "derived_to", 5, "Contemporary R&B modernized soul with 808 drum machines.", "当代 R&B 用 808 鼓机现代化了灵魂乐。"),
    ("contemporary-rnb", "alternative-rnb", "derived_to", 5, "Alternative R&B darkened R&B with moody indie aesthetics.", "另类 R&B 用独立暗黑美学深化了 R&B。"),
    ("disco", "city-pop", "fusion_with", 5, "City pop merged disco-funk with Japanese urban songwriting.", "City Pop 融合了迪斯科放克与日本都市创作。"),
    ("synth-pop", "k-pop", "influenced_by", 4, "K-pop combined modern synth-pop with choreography.", "K-Pop 将现代合成流行与高难度编舞结合。"),
    ("city-pop", "j-pop", "derived_to", 5, "J-pop evolved from City Pop and Kayōkyoku with anime power.", "J-Pop 脱胎于 City Pop 与歌谣曲，充满动漫感染力。"),
    ("samba", "bossa-nova", "derived_to", 5, "Bossa nova softened energetic samba into an acoustic sway.", "波萨诺瓦将欢快桑巴柔化为原声慢摇。"),
    ("reggae", "dub", "derived_to", 5, "Dub stripped reggae down into echoing mixing desk art.", "Dub 将雷鬼解构为充满回声的调音台艺术。"),
    ("reggae", "dancehall", "derived_to", 5, "Dancehall digitalized reggae riddims for sound-clashes.", "舞厅雷鬼将雷鬼音乐数字化为斗歌利器。"),
    ("dancehall", "reggaeton", "derived_to", 5, "Reggaeton adapted dancehall riddims into Dembow bounce.", "雷鬼顿将舞厅雷鬼演化为洗脑的 Dembow 弹跳。"),
    ("afrobeat", "amapiano", "influenced_by", 4, "Amapiano drew from Afrobeat and African house roots.", "Amapiano 汲取了非洲节拍与本土浩室的灵性养分。"),
    # Complete remaining genre bridges (P4-09: 100% 159 sources graph coverage)
    ("acid-techno", "detroit-techno", "origin_from", 5, "Acid techno evolved from techno using TB-303 lines.", "Acid Techno 采用 TB-303 酸性贝斯线演化自 Techno。"),
    ("acid-techno", "acid-house", "influenced_by", 5, "Acid techno took heavy cues from early acid house.", "Acid Techno 深受早期 Acid House 启发。"),
    ("future-house", "deep-house", "origin_from", 5, "Future house energized deep house with metallic plucks.", "Future House 用金属质感拨弦强化了 Deep House。"),
    ("wave", "trap-rap", "origin_from", 4, "Wave music fused trap 808s with ambient synth textures.", "Wave 音乐融合了 Trap 808 与环境合成器纹理。"),
    ("kuduro", "afro-house", "fusion_with", 5, "Kuduro combined Angolan rhythms with electronic house.", "Kuduro 将安哥拉民间节奏与电子浩室融合。"),
    ("kuduro", "afrobeat", "origin_from", 4, "Kuduro roots trace back to African percussive traditions.", "Kuduro 根植于非洲打击乐律动传统。"),
    ("bachata", "salsa", "fusion_with", 5, "Bachata and salsa share vibrant Caribbean social dance roots.", "Bachata 与 Salsa 共享充满活力的加勒比社交舞曲传统。"),
    ("salsa", "cumbia", "fusion_with", 5, "Salsa and Cumbia share deep Afro-Latin syncopated grooves.", "Salsa 与 Cumbia 共享深厚的非裔拉丁切分律动。"),
    ("cumbia", "reggaeton", "fusion_with", 4, "Cumbia syncopations heavily influenced early reggaeton dembow.", "Cumbia 切分律动深度影响了早期 Reggaeton Dembow 鼓点。"),
]

for s, t, r, w, de, dz in fusions:
    add_rel(s, t, r, w, de, dz)
    # Automatically add reciprocal relationship to guarantee bidirectional graph traversal (P4-09)
    recip = "origin_from" if r == "derived_to" else ("derived_to" if r == "origin_from" else ("fusion_with" if r == "fusion_with" else "influenced_by"))
    rde = f"{t} links historically back to {s}."
    rdz = f"{t} 在音乐历史渊源上追溯关联至 {s}。"
    add_rel(t, s, recip, w, rde, rdz)

relations_content = f"""import {{ GenreRelation }} from '../types/genre';

export const GENRE_RELATIONS: GenreRelation[] = {json.dumps(relations, ensure_ascii=False, indent=2)};
"""

with open(os.path.join(SRC_DATA, "relations.ts"), "w", encoding="utf-8") as f:
    f.write(relations_content)
print(f"Created src/data/relations.ts with {len(relations)} relations, covering {len(set(r['source'] for r in relations))} unique sources.")

# 4. Generate timeline_stories.ts for vertical timeline
stories = [
    {
        "id": "story-1900-delta",
        "decade": 1900,
        "year": "1900s",
        "title": {
            "en": "Origins: Mud, Churches, and Delta Blues",
            "zh": "源头：泥水、教堂与三角洲布鲁斯"
        },
        "description": {
            "en": "In the Mississippi Delta, African-American laborers combined spiritual field hollers and work songs to forge the blues. Using acoustic slide guitars and foot stomps, they established the 12-bar harmonic foundation that would underpin all modern Western popular and dance music.",
            "zh": "在密西西比三角洲的棉花田里，非裔劳工将灵性田野呼号与福音劳动歌熔铸为最初的布鲁斯。借助原声滑棒吉他与脚步重踏，他们确立了神圣的 12 小节和声架构，奠定了整个现代西方流行乐与舞曲的基石。"
        },
        "genre_ids": ["delta-blues", "traditional-jazz"]
    },
    {
        "id": "story-1930-swing-city",
        "decade": 1930,
        "year": "1930s",
        "title": {
            "en": "Big Bands, Gypsy Fire, and Texas Roads",
            "zh": "大乐队、吉普赛之火与德州行进"
        },
        "description": {
            "en": "The Swing Era brought jazz to ballroom dancefloors across America. Meanwhile in Paris, Django Reinhardt pioneered Gypsy Jazz with breathtaking acoustic virtuosity, and Texas guitarists began amplifying the blues for crowded honky-tonks.",
            "zh": "摇摆乐大乐队时代让爵士乐风靡全美舞厅。与此同一时期在巴黎，Django Reinhardt 凭借神乎其技的指弹开创了吉普赛爵士，而德州乐手们开始在拥挤的酒馆里将布鲁斯音箱开向过载。"
        },
        "genre_ids": ["texas-blues", "gypsy-jazz", "cumbia", "samba"]
    },
    {
        "id": "story-1940-electric-rebirth",
        "decade": 1940,
        "year": "1940s",
        "title": {
            "en": "Electrification, Bebop Revolution, and Post-War Pop",
            "zh": "电气化冲击、比波普革命与战后金曲"
        },
        "description": {
            "en": "Muddy Waters arrived in Chicago, plugging the acoustic blues into tube amplifiers. Simultaneously in Harlem, Charlie Parker and Dizzy Gillespie shattered dance conventions with blistering bebop speeds, turning jazz into high art while crooners ruled popular radio.",
            "zh": "Muddy Waters 抵达芝加哥，将原声布鲁斯插入电子管放大器，炸裂了南区俱乐部。在哈莱姆，Charlie Parker 与 Dizzy Gillespie 用闪电般的比波普速度击碎平庸舞曲规则，将爵士提升为纯艺术。"
        },
        "genre_ids": ["chicago-blues", "bebop", "traditional-pop", "electric-blues", "cool-jazz"]
    },
    {
        "id": "story-1950-rock-and-soul",
        "decade": 1950,
        "year": "1950s",
        "title": {
            "en": "The Birth of Rock 'n' Roll, Soul, and Bossa Nova",
            "zh": "摇滚破晓、灵魂之声与海滨波萨诺瓦"
        },
        "description": {
            "en": "Chuck Berry and Little Richard married rhythm and blues with country, birthing rock and roll that electrified youth culture. Ray Charles and Sam Cooke forged soul from gospel passion, while in Rio, João Gilberto whispered the gentle bossa nova into world consciousness.",
            "zh": "Chuck Berry 与 Little Richard 将节奏布鲁斯与乡村音乐结合，诞生了令全球青年发狂的摇滚乐。Ray Charles 用福音激情点燃了灵魂乐，而在里约的海滩，João Gilberto 耳语般的 Bossa Nova 飘向全世界。"
        },
        "genre_ids": ["rock-and-roll", "soul", "bossa-nova", "modal-jazz", "hard-bop", "free-jazz", "motown"]
    },
    {
        "id": "story-1960-psychedelia-funk",
        "decade": 1960,
        "year": "1960s",
        "title": {
            "en": "The Golden Decade: Funk, Heavy Metal, and Dub",
            "zh": "黄金年代：放克基石、重金属轰鸣与回响实验"
        },
        "description": {
            "en": "James Brown invented funk by landing hard on 'The One', inventing the modern dance groove pocket. Black Sabbath forged heavy metal in Birmingham, Jamaican engineers invented dub with tape echoes, and Miles Davis brought electricity to jazz with Bitches Brew.",
            "zh": "James Brown 以无可撼动的第 1 拍重音（The One）确立了放克，定义了现代舞曲身体律动。Black Sabbath 在伯明翰铸就重金属，牙买加录音师把调音台当作乐器开创了 Dub 回响，Miles Davis 则用通电融合爵士颠覆世界。"
        },
        "genre_ids": ["funk", "heavy-metal", "hard-rock", "blues-rock", "reggae", "dub", "afrobeat", "progressive-rock", "jazz-fusion", "salsa"]
    },
    {
        "id": "story-1970-disco-punk-hiphop",
        "decade": 1970,
        "year": "1970s",
        "title": {
            "en": "The Trinity: Disco Fever, Punk Fury, and Bronx Hip Hop",
            "zh": "三位一体：迪斯科热潮、朋克狂怒与嘻哈诞生"
        },
        "description": {
            "en": "Four-on-the-floor disco united dancefloors worldwide, while stripped-down punk rock ignited London and NYC with three chords. In the Bronx, DJ Kool Herc isolated drum breaks on turntables, birthing hip hop culture and changing music production forever.",
            "zh": "四踩四迪斯科统领全球舞池，朋克三和弦在伦敦与纽约点燃地下怒火。在布朗克斯，DJ Kool Herc 用双唱机循环延长鼓碎拍，宣告嘻哈文化降生，永远重塑了全球音乐制作形态。"
        },
        "genre_ids": ["disco", "punk-rock", "old-school-hip-hop", "synth-pop", "post-punk", "new-wave", "ambient", "city-pop", "dancehall"]
    },
    {
        "id": "story-1980-house-techno-dawn",
        "decade": 1980,
        "year": "1980s",
        "title": {
            "en": "Machines Awakening: Chicago House, Detroit Techno, and 808s",
            "zh": "机器觉醒：芝加哥浩室、底特律铁克诺与 808 浪潮"
        },
        "description": {
            "en": "Frankie Knuckles at The Warehouse laid the blueprint for house music. In Detroit, The Belleville Three envisioned machine-funk techno. The Roland TR-808, TR-909, and TB-303 fueled acid house, electro, thrash metal, and golden-age boom bap.",
            "zh": "Frankie Knuckles 在 The Warehouse 描绘出 House 的神圣蓝图；底特律贝尔维尔三人组构想出机械放克 Techno。Roland TR-808、909 与 TB-303 激荡起 Acid House、Electro、激流金属与黄金时代 Boom Bap 的漫天星火。"
        },
        "genre_ids": ["chicago-house", "detroit-techno", "acid-house", "deep-house", "electro", "boom-bap", "thrash-metal", "death-metal", "contemporary-rnb", "chiptune"]
    },
    {
        "id": "story-1990-rave-breakbeat",
        "decade": 1990,
        "year": "1990s",
        "title": {
            "en": "The UK Rave Continuum, Trance Anthems, and Grunge",
            "zh": "英国狂欢连续体、出神赞歌与垃圾摇滚冲击"
        },
        "description": {
            "en": "UK producers sliced the Amen break into jungle and drum and bass. Uplifting trance swept stadium festivals with emotional supersaws. Grunge swept American radio, G-Funk cruised West Coast streets, and Bristol trip hop drenched world sound in shadowy beauty.",
            "zh": "英国制作人将 Amen break 切割为丛林乐与 Drum & Bass 疾驰狂欢。Uplifting Trance 以史诗 Supersaw 席卷万人音乐节，西雅图 Grunge 击穿电台，G-Funk 巡游加州街头，布里斯托神游舞曲（Trip Hop）给世界蒙上绝美阴翳。"
        },
        "genre_ids": ["jungle", "uplifting-trance", "progressive-house", "trip-hop", "g-funk", "grunge", "uk-garage", "hardcore-gabber", "minimal-techno", "dub-techno", "eurodance", "neo-soul", "metalcore", "reggaeton"]
    },
    {
        "id": "story-2000-bass-explosion",
        "decade": 2000,
        "year": "2000s",
        "title": {
            "en": "Sub-Bass Pressure, Grime, Electro House, and Synthwave",
            "zh": "深海重低音、污垢说唱、电锯浩室与合成器波"
        },
        "description": {
            "en": "In South London, dubstep explored physical sub-bass pressure, while grime emerged from East London pirate radio. Electro house brought distorted buzz-saws to peak-time clubs, liquid DnB injected jazz soul, and internet producers forged retro synthwave.",
            "zh": "在南伦敦，Dubstep 探索了撼动胸腔的物理超低压，东伦敦黑电台孕育出野蛮 Grime。Electro House 用狂暴电锯锯齿波统治顶峰俱乐部，Liquid DnB 注入灵魂乐温度，互联网极客则点燃了复古合成波（Synthwave）。"
        },
        "genre_ids": ["dubstep", "grime", "electro-house", "liquid-dnb", "bassline", "afro-house", "nu-disco-house", "trap-rap", "synthwave", "moombahton", "jersey-club"]
    },
    {
        "id": "story-2010-future-drill-era",
        "decade": 2010,
        "year": "2010s",
        "title": {
            "en": "Future Bass, Festival EDM Trap, and The Drill Revolution",
            "zh": "未来贝斯、音乐节电音陷阱与钻头风暴"
        },
        "description": {
            "en": "Flume and San Holo introduced bright LFO-wobble future bass. EDM trap and brostep dominated festival mainstages. Chicago drill evolved into UK and Brooklyn drill, changing global hip hop forever with sliding 808s and syncopated snare skips.",
            "zh": "Flume 与 San Holo 带来了晶莹绚丽的 Future Bass；EDM Trap 与狂暴 Brostep 主宰世界顶级主舞台；芝加哥 Drill 演变为席卷全球的 UK 与 Brooklyn Drill，以标志性滑音 808 彻底颠覆了现代嘻哈音乐。"
        },
        "genre_ids": ["future-bass", "edm-trap", "brostep", "uk-drill", "brooklyn-drill", "future-house", "bass-house", "melodic-dubstep", "melodic-house", "tropical-house", "vaporwave", "lofi-hip-hop", "amapiano", "alternative-rnb"]
    },
    {
        "id": "story-2020-hybrid-hyper",
        "decade": 2020,
        "year": "2020s",
        "title": {
            "en": "Speed, Hybrids, and Global Renaissance",
            "zh": "极速突进、无界杂交与全球文艺复兴"
        },
        "description": {
            "en": "Music boundaries dissolved as producers forged Jersey Drill, Drift Phonk, fast Hard Techno, and Amapiano. Global cross-pollination at 150+ BPM proved that groove, emotion, and machine synthesis continue to evolve endlessly.",
            "zh": "流派边界彻底消融，制作人们创造出泽西钻头、漂移放克（Drift Phonk）、155 BPM 极速硬核 Techno 与南非 Amapiano。全球多源跨界证明，律动、情感与机器合成的演进永无止境。"
        },
        "genre_ids": ["jersey-drill", "drift-phonk", "hard-techno", "amapiano", "speedbass", "tearout-dubstep", "peak-time-techno"]
    }
]

timeline_content = f"""export interface TimelineStory {{
  id: string;
  decade: number;
  year: string;
  title: {{ en: string; zh: string }};
  description: {{ en: string; zh: string }};
  genre_ids: string[];
}}

export const TIMELINE_STORIES: TimelineStory[] = {json.dumps(stories, ensure_ascii=False, indent=2)};
"""

with open(os.path.join(SRC_DATA, "timeline_stories.ts"), "w", encoding="utf-8") as f:
    f.write(timeline_content)
print(f"Created src/data/timeline_stories.ts with {len(stories)} stories.")
