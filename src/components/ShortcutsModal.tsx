import React from "react";
import { Modal } from "../ui/Modal";
import { useLanguage } from "../i18n/LanguageContext";
import { Keyboard, Navigation, Music, HelpCircle } from "lucide-react";

export interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { isZh } = useLanguage();
  const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  const modKey = isMac ? "⌘" : "Ctrl";

  const navigationShortcuts = [
    { keys: ["g", "s"], desc: isZh ? "跳转至 工作台" : "Go to Studio" },
    { keys: ["g", "c"], desc: isZh ? "跳转至 和弦走向" : "Go to Chords" },
    { keys: ["g", "g"], desc: isZh ? "跳转至 律动星系" : "Go to Galaxy" },
    { keys: ["g", "t"], desc: isZh ? "跳转至 水平时间线" : "Go to Timeline" },
    { keys: ["g", "v"], desc: isZh ? "跳转至 垂直时间轴" : "Go to Story" },
    { keys: ["g", "m"], desc: isZh ? "跳转至 曲风对比" : "Go to Compare" },
    { keys: ["g", "q"], desc: isZh ? "跳转至 听音挑战" : "Go to Challenge" },
    { keys: [modKey, "K"], desc: isZh ? "打开全局搜索" : "Open Global Search" },
    { keys: ["?"], desc: isZh ? "打开此快捷键面板" : "Show Keyboard Shortcuts" },
    { keys: ["Esc"], desc: isZh ? "关闭当前弹窗 / 抽屉" : "Close Dialog / Drawer" },
  ];

  const studioShortcuts = [
    { keys: ["Space"], desc: isZh ? "播放 / 暂停" : "Play / Pause playback" },
    { keys: ["D"], desc: isZh ? "只听鼓组快捷切换 (Drums Only)" : "Toggle Drums Only mode" },
    { keys: [modKey, "Z"], desc: isZh ? "撤销步进修改" : "Undo pattern change" },
    { keys: [modKey, isMac ? "⇧Z" : "Y"], desc: isZh ? "重做步进修改" : "Redo pattern change" },
    { keys: ["↑", "↓", "←", "→"], desc: isZh ? "音序网格步进键位漫游" : "Navigate grid step cells" },
    { keys: ["Enter", "Space"], desc: isZh ? "步进激活与切换" : "Toggle active step" },
    { keys: ["Home", "End"], desc: isZh ? "跳转至行首 / 行尾" : "Jump to first / last step" },
    { keys: ["V"], desc: isZh ? "开闭力度抽屉 (Velocity)" : "Toggle Velocity lane" },
    { keys: ["E"], desc: isZh ? "打开欧几里得律动器" : "Open Euclidean generator" },
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isZh ? "键盘快捷键指南" : "Keyboard Shortcuts Guide"}
      className="max-w-2xl"
    >
      <div className="space-y-6 max-h-[75vh] overflow-y-auto pr-1">
        {/* Navigation Section */}
        <div>
          <div className="flex items-center gap-2 text-accent text-xs font-bold uppercase tracking-wider mb-3">
            <Navigation className="w-4 h-4" />
            <span>{isZh ? "全局导航快捷键 (按 g 后快速按字母)" : "Global Navigation (Press g followed by key)"}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {navigationShortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-panel2 border border-line-subtle"
              >
                <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                <div className="flex items-center gap-1">
                  {sc.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1d2028] text-text border border-line rounded shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Studio Sequencer Section */}
        <div>
          <div className="flex items-center gap-2 text-[#45e0c9] text-xs font-bold uppercase tracking-wider mb-3">
            <Music className="w-4 h-4" />
            <span>{isZh ? "工作台音序器快捷键" : "Studio Sequencer Shortcuts"}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {studioShortcuts.map((sc, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2.5 rounded-xl bg-panel2 border border-line-subtle"
              >
                <span className="text-xs text-text-sub font-medium">{sc.desc}</span>
                <div className="flex items-center gap-1">
                  {sc.keys.map((k, kIdx) => (
                    <kbd
                      key={kIdx}
                      className="px-2 py-0.5 min-w-[22px] text-center text-xs font-mono font-bold bg-[#1d2028] text-text border border-line rounded shadow-sm"
                    >
                      {k}
                    </kbd>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
};
