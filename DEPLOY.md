# Groove & Genre Odyssey 部署与运维指南

本系统基于 **纯前端静态架构 (Pure Frontend Static Architecture)** 设计，无任何后端服务或外部采样音频依赖，具备真正的零延迟、离线即用 (Offline-first PWA) 特性。

---

## 1. 部署产物概览

- **部署包位置**: `release/groove-release.tar.gz` (约 772 KB)
- **解压后目录**: `dist/`
  - `index.html`: 单页面应用入口
  - `assets/`: 编译压缩后的 JS / CSS 核心产物
  - `manifest.webmanifest`: PWA Web App 清单
  - `sw.js`: 离线优先 Service Worker 缓存脚本
  - `icons/`: 高清 SVG 矢量图标

---

## 2. 快速启动与预览

### 本地预览 (Node.js)
```bash
# 使用内置 preview 命令 (基于 Vite)
npm run preview

# 或使用 npx serve
npx serve -s dist -l 3000

# 或使用 Python 内置静态服务器
cd dist && python3 -m http.server 8080
```
启动后在浏览器打开 `http://localhost:4173`（`npm run preview` 的默认端口）、`http://localhost:3000`（`npx serve`）或 `http://localhost:8080`（Python）即可使用。

### 本地开发端口 (Local development ports)

`vite.config.ts` 的端口全部由环境变量驱动，便于在同一台机器上并行运行多个 worktree 而互不抢占端口：

| 环境变量 | 作用 | 默认值 |
| --- | --- | --- |
| `PORT` | `npm run dev` 开发服务器端口（优先级最高） | `3000` |
| `VITE_PORT` | `npm run dev` 开发服务器端口（仅在 `PORT` 未设置时生效） | `3000` |
| `PREVIEW_PORT` | `npm run preview` 预览服务器端口 | `4173` |

- 同时设置 `PORT` 与 `VITE_PORT` 时以 `PORT` 为准；非数字或非正数会回退到默认值。
- `server.strictPort` 与 `preview.strictPort` 均为 `false`：端口被占用时 Vite 会自动顺延到下一个可用端口，实际绑定端口以终端输出为准。

**Worktree 端口约定**：每个 worktree 分配一个偏移量 N（第 1 个 N=1、第 2 个 N=2…），开发端口取 `3100 + N`，预览端口建议取 `4200 + N`，从而与默认的 3000/4173 以及彼此隔离：

```bash
# 在偏移量 N=3 的 worktree 中
PORT=$((3100 + 3)) npm run dev              # 开发服务器 :3103
PREVIEW_PORT=$((4200 + 3)) npm run preview  # 预览服务器 :4203
```

---

## 3. 生产环境部署方案

### 方案 A: Nginx 部署
解压 `release/groove-release.tar.gz` 到 Web 根目录，例如 `/var/www/groove`:
```bash
tar -xzvf release/groove-release.tar.gz -C /var/www/groove --strip-components=1
```

在 Nginx 配置文件中加入：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    root /var/www/groove;
    index index.html;

    # 启用 Gzip 压缩
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # 单页面应用路由重定向
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Service Worker 与 Manifest 不缓存或短缓存
    location ~* (sw\.js|manifest\.webmanifest)$ {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # 静态静态资源长缓存
    location ~* \.(js|css|svg|png|jpg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### 方案 B: Docker 极简容器化
使用轻量级 Nginx Alpine 镜像运行：
```dockerfile
FROM nginx:alpine
COPY dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

构建与运行：
```bash
docker build -t groove-odyssey .
docker run -d -p 80:80 --name groove-odyssey groove-odyssey
```

### 方案 C: Vercel / Netlify / Cloudflare Pages
1. 将代码仓库推送到 GitHub / GitLab。
2. 在托管平台选择项目，构建配置设置为：
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
3. 点击 Deploy 即可秒级上线，自带全局 CDN 加速和 HTTPS。

---

## 4. 特性与技术规范验证

- **曲风库容量**: 159 个独立曲风（包含 93 个电子音乐曲风，66 个其他主流曲风），均配备中英双语制作指南与 8 轨节奏模板。
- **纯合成音频**: 原生 Web Audio API 振荡器与滤镜实时生成，支持 MIDI 文件导出与 Base64 URL 分享。
- **PWA 与离线现状**: 当前主动注销旧版 Service Worker 以杜绝静态资源死锁；静态资源依托 Cloudflare Edge CDN 全球强缓存与 Vite 产物 Hash 版本控制；现代化 Workbox 离线精细缓存策略规划于 Phase 5 实施。
- **测试与质量验证**: 401 项严格单元与集成测试（49 个测试文件，覆盖音频限幅/Panic、时钟/Worker、和弦生成、BPM 解析、URL 编解码安全、全站 ErrorBoundary 容灾与 159 曲风运行时 Schema），并通过 GitHub Actions CI（`main`/`next` 分支，含覆盖率阈值、版本单源、红线与 e2e 矩阵）及本地 `npm run verify` 门禁校验。
- **发布全自动化门禁 (Pre-Release Test Matrix)**: 每次发布（`npm run deploy` / `npm run package`）前自动触发 `npm run verify`，集成 Playwright 自动化测试矩阵（`npm run test:e2e`），在真实的无头引擎中逐一验证 7 大关键运行环境：
  1. **Desktop Chromium / Google Chrome** (1280x800)
  2. **Desktop Firefox** (1280x800)
  3. **Desktop WebKit (Safari Engine)** (1280x800)
  4. **iPhone 14 竖屏 (Portrait)** (390x844, Touch/Mobile WebKit)
  5. **iPhone 14 横屏 (Landscape)** (844x390, Touch/Mobile WebKit)
  6. **iPad Pro 11 竖屏 (Portrait)** (834x1194, Touch/Tablet WebKit)
  7. **iPad Pro 11 横屏 (Landscape)** (1194x834, Touch/Tablet WebKit)
  - 自动化断言：Studio 走带交互与发声、和弦工坊折叠与展开、Galaxy 3D WebGL 画布渲染与优雅回退、全站 8 大视图无白屏与无未捕获异常、中文设计基线及中英双语切换无视口横向滚动溢出。



---

## 端到端测试依赖（Playwright）

`playwright` **尚未**写入 `devDependencies`，因为本仓库的 `package-lock.json` 需要在有网络的机器上重新生成；直接声明会导致 CI 的 `npm ci` 因"package.json 与 lockfile 不一致"而失败。

当前状态：

- **CI**：e2e job 使用 `npm install --no-save playwright@1.63.0` 临时安装（不改动 lockfile），再 `npx playwright install --with-deps`。
- **本地**：若 Playwright 已存在于其他位置（如全局安装），可用环境变量指向其 `node_modules`：

  ```bash
  PLAYWRIGHT_MODULE_PATH=/path/to/node_modules npm run test:e2e
  ```

- **收敛方式**（需要网络，一次性）：`npm install -D playwright`，随后删除 CI 中的临时安装步骤。

`scripts/test_matrix.js` 的静态服务器始终使用 `listen(0)` 的内核临时端口，多实例并行不会互相抢占端口。
