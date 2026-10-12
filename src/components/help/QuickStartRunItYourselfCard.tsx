/**
 * The "run it yourself" card in the help centre's Quick Start tab.
 *
 * It lives in its own file for two reasons. The owner asked for the requirements and the build/run commands to
 * appear prominently inside the app as well as in the README, and the help centre's own file is pinned by the
 * file-size budget, which only moves down — so the content goes where it does not push a pinned file over its
 * recorded size. Keeping it separate also means the in-app criterion next door (`helpQuickStartCard.test.ts`)
 * can read exactly this card and the tab that mounts it, without parsing a 1700-line component.
 */
import { BookOpen } from "lucide-react";

export function QuickStartRunItYourselfCard({ isZh }: { isZh: boolean }) {
  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-[#10131d] border border-line/60 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-accent" />
        <h4 className="text-sm font-bold text-text">
          {isZh ? "自己跑起来（从源码构建）" : "Run it yourself (from source)"}
        </h4>
      </div>
      <p className="text-xs text-text-sub leading-relaxed">
        {isZh
          ? "环境要求：Node.js 22.22.2 或更高（engines: ^22.22.2 || ^24.15.0 || >=26.0.0）。Node 只用于构建；运行应用只需浏览器，无后端、无数据库、无需 API key。"
          : "Requirements: Node.js 22.22.2 or newer (engines: ^22.22.2 || ^24.15.0 || >=26.0.0). Node is only needed to build; running the app needs nothing but a browser, with no backend, no database and no API key."}
      </p>
      <pre className="text-[11px] font-mono leading-relaxed text-text-sub bg-[#0b0e16] border border-line/60 rounded-xl p-3 overflow-x-auto">
{`npm install        # once
npm run dev        # http://localhost:3000
npm run build      # static output in dist/
npm run preview    # serve that build locally`}
      </pre>
      <p className="text-[11px] text-text-dim font-mono">
        {isZh ? "质量门：npm test ｜ npm run verify" : "Gates: npm test | npm run verify"}
      </p>
    </div>
  );
}
